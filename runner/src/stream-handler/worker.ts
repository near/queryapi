import { isMainThread, parentPort, workerData } from 'worker_threads';
import promClient from 'prom-client';

import Indexer from '../indexer';
import RedisClient, { type StreamType } from '../redis-client';
import { METRICS } from '../metrics';
import type { Block } from '@near-lake/primitives';
import LakeClient from '../lake-client';
import { type IndexerConfig } from './stream-handler';
import { Tracer, BatchRecorder, jsonEncoder, type Recorder, Annotation } from 'zipkin';
import { HttpLogger } from 'zipkin-transport-http';
import CLSContext from 'zipkin-context-cls';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}

const zipkinBaseUrl = 'http://localhost:9411';

const httpLogger = new HttpLogger({
  endpoint: `${zipkinBaseUrl}/api/v2/spans`,
  jsonEncoder: jsonEncoder.JSON_V2
});

function debugRecorder (serviceName: string): Recorder {
  const logger = {
    logSpan: (span: any) => {
      const json = jsonEncoder.JSON_V2.encode(span);
      console.log(`${serviceName} reporting: ${json}`);
      httpLogger.logSpan(span);
    }
  };

  const batchRecorder = new BatchRecorder({ logger });

  return {
    record: (rec: any) => {
      const { spanId, traceId } = rec.traceId;
      console.log(`${serviceName} recording: ${traceId as string}/${spanId as string} ${rec.annotation as string}`);
      batchRecorder.record(rec);
    }
  };
}

// Setup the tracer
const tracer = new Tracer({
  ctxImpl: new CLSContext('zipkin'),
  recorder: debugRecorder('runner'),
  localServiceName: 'runner' // name of this application
});

interface QueueMessage {
  block: Block
  streamMessageId: string
}
type PrefetchQueue = Array<Promise<QueueMessage>>;

interface WorkerContext {
  redisClient: RedisClient
  lakeClient: LakeClient
  queue: PrefetchQueue
  streamKey: string
  streamType: StreamType
}

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

let config: IndexerConfig | undefined;

void (async function main () {
  const { streamKey, indexerConfig } = workerData;
  config = indexerConfig;
  const redisClient = new RedisClient();
  const workerContext: WorkerContext = {
    redisClient,
    lakeClient: new LakeClient(),
    queue: [],
    streamKey,
    streamType: redisClient.getStreamType(streamKey),
  };

  console.log('Started processing stream: ', streamKey);

  await handleStream(workerContext, streamKey);
})();

async function handleStream (workerContext: WorkerContext, streamKey: string): Promise<void> {
  void blockQueueProducer(workerContext, streamKey);
  void blockQueueConsumer(workerContext, streamKey);
}

function incrementId (id: string): string {
  const [main, sequence] = id.split('-');
  return `${main}-${Number(sequence) + 1}`;
}

async function blockQueueProducer (workerContext: WorkerContext, streamKey: string): Promise<void> {
  const HISTORICAL_BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? '10');
  let streamMessageStartId = '0';

  while (true) {
    const preFetchCount = HISTORICAL_BATCH_SIZE - workerContext.queue.length;
    if (preFetchCount <= 0) {
      await sleep(100);
      continue;
    }
    const messages = await workerContext.redisClient.getStreamMessages(streamKey, streamMessageStartId, preFetchCount);
    if (messages == null) {
      await sleep(100);
      continue;
    }

    for (const streamMessage of messages) {
      const { id, message } = streamMessage;
      workerContext.queue.push(generateQueueMessage(workerContext, Number(message.block_height), id));
    }

    streamMessageStartId = incrementId(messages[messages.length - 1].id);
  }
}

async function blockQueueConsumer (workerContext: WorkerContext, streamKey: string): Promise<void> {
  const indexer = new Indexer();
  const isHistorical = workerContext.streamType === 'historical';
  let streamMessageId = '';
  let indexerName = '';
  let currBlockHeight = 0;

  while (true) {
    try {
      if (workerContext.queue.length === 0) {
        await sleep(100);
        continue;
      }
      const startTime = performance.now();
      // TODO: Remove redis storage call after full V2 migration

      const newTrace = tracer.createRootId();
      tracer.setId(newTrace);
      tracer.recordServiceName('runner');
      tracer.recordAnnotation(new Annotation.LocalOperationStart(`Processing block for ${indexerName} ${workerContext.streamType}`));
      tracer.recordAnnotation(new Annotation.LocalOperationStop());

      const blockStartTime = performance.now();
      const queueMessage = await tracer.local('fetch block data', async () => {
        return await workerContext.queue.at(0);
      });
      if (queueMessage === undefined) {
        continue;
      }
      const block = queueMessage.block;
      currBlockHeight = block.blockHeight;
      streamMessageId = queueMessage.streamMessageId;

      if (block === undefined || block.blockHeight == null) {
        console.error('Block failed to process or does not have block height', block);
        continue;
      }
      METRICS.BLOCK_WAIT_DURATION.labels({ indexer: indexerName, type: workerContext.streamType }).observe(performance.now() - blockStartTime);

      const indexerConfig = await tracer.local('fetch config from redis', async () => {
        return await (config ?? workerContext.redisClient.getStreamStorage(streamKey));
      });
      indexerName = `${indexerConfig.account_id}/${indexerConfig.function_name}`;
      const functions = {
        [indexerName]: {
          account_id: indexerConfig.account_id,
          function_name: indexerConfig.function_name,
          code: indexerConfig.code,
          schema: indexerConfig.schema,
          provisioned: false,
        },
      };

      await tracer.local('run function', async () => {
        await indexer.runFunctions(block, functions, isHistorical, { provision: true });
      });

      await workerContext.redisClient.deleteStreamMessage(streamKey, streamMessageId);
      await workerContext.queue.shift();

      METRICS.EXECUTION_DURATION.labels({ indexer: indexerName, type: workerContext.streamType }).observe(performance.now() - startTime);

      METRICS.LAST_PROCESSED_BLOCK_HEIGHT.labels({ indexer: indexerName, type: workerContext.streamType }).set(currBlockHeight);

      console.log(`Success: ${indexerName} ${workerContext.streamType} on block ${currBlockHeight}}`);
    } catch (err) {
      await sleep(10000);
      console.log(`Failed: ${indexerName} ${workerContext.streamType} on block ${currBlockHeight}`, err);
    } finally {
      const unprocessedMessageCount = await workerContext.redisClient.getUnprocessedStreamMessageCount(streamKey);
      METRICS.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName, type: workerContext.streamType }).set(unprocessedMessageCount);

      parentPort?.postMessage(await promClient.register.getMetricsAsJSON());
    }
  }
}

async function generateQueueMessage (workerContext: WorkerContext, blockHeight: number, streamMessageId: string): Promise<QueueMessage> {
  const block = await workerContext.lakeClient.fetchBlock(blockHeight, workerContext.streamType === 'historical');
  return {
    block,
    streamMessageId
  };
}
