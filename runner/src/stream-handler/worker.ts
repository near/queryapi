import { isMainThread, parentPort, workerData } from 'worker_threads';
import promClient from 'prom-client';
import Indexer from '../indexer';
import RedisClient, { type StreamType } from '../redis-client';
import { METRICS } from '../metrics';
import type { Block } from '@near-lake/primitives';
import LakeClient from '../lake-client';
import { WorkerMessageType, type IndexerConfig, type WorkerMessage, type IndexerBehavior } from './stream-handler';
import { trace, type Span, context } from '@opentelemetry/api';
import setUpTracerExport from '../instrumentation';
import { IndexerStatus } from '../indexer-logger/indexer-logger';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}
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
  indexerConfig: IndexerConfig
  indexerBehavior: IndexerBehavior
}

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };
setUpTracerExport();
const tracer = trace.getTracer('queryapi-runner-worker');

void (async function main () {
  const { streamKey, indexerConfig, indexerBehavior } = workerData;
  const redisClient = new RedisClient();
  const workerContext: WorkerContext = {
    redisClient,
    lakeClient: new LakeClient(),
    queue: [],
    streamKey,
    // TODO: Remove Stream Type from Worker and Metrics
    streamType: redisClient.getStreamType(streamKey),
    indexerConfig,
    indexerBehavior,
  };

  console.log('Started processing stream: ', streamKey, indexerConfig.account_id, indexerConfig.function_name, indexerConfig.version, indexerBehavior);

  await handleStream(workerContext, streamKey);
})();

async function handleStream (workerContext: WorkerContext, streamKey: string): Promise<void> {
  void blockQueueProducer(workerContext, streamKey);
  void blockQueueConsumer(workerContext, streamKey);
}

async function blockQueueProducer (workerContext: WorkerContext, streamKey: string): Promise<void> {
  const HISTORICAL_BATCH_SIZE = parseInt(process.env.PREFETCH_QUEUE_LIMIT ?? '10');
  let streamMessageStartId = '0';

  while (true) {
    const preFetchCount = HISTORICAL_BATCH_SIZE - workerContext.queue.length;
    try {
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
        workerContext.queue.push(generateQueuePromise(workerContext, Number(message.block_height), id));
      }

      streamMessageStartId = messages[messages.length - 1].id;
    } catch (err) {
      console.error('Error fetching stream messages', err);
      await sleep(500);
    }
  }
}

async function blockQueueConsumer (workerContext: WorkerContext, streamKey: string): Promise<void> {
  let previousError: string = '';
  const indexer = new Indexer(workerContext.indexerBehavior);
  const isHistorical = workerContext.streamType === 'historical';
  let streamMessageId = '';
  let currBlockHeight = 0;
  const indexerName = `${workerContext.indexerConfig.account_id}/${workerContext.indexerConfig.function_name}`;
  const functions = {
    [indexerName]: {
      account_id: workerContext.indexerConfig.account_id,
      function_name: workerContext.indexerConfig.function_name,
      code: workerContext.indexerConfig.code,
      schema: workerContext.indexerConfig.schema,
      provisioned: false,
    },
  };

  while (true) {
    if (workerContext.queue.length === 0) {
      await sleep(100);
      continue;
    }
    await tracer.startActiveSpan(`${indexerName}`, async (parentSpan: Span) => {
      parentSpan.setAttribute('indexer', indexerName);
      parentSpan.setAttribute('account', workerContext.indexerConfig.account_id);
      parentSpan.setAttribute('service.name', 'queryapi-runner');
      try {
        const startTime = performance.now();
        const blockStartTime = performance.now();

        const queueMessage = await tracer.startActiveSpan('Wait for block to download', async (blockWaitSpan: Span) => {
          try {
            return await workerContext.queue.at(0);
          } finally {
            blockWaitSpan.end();
          }
        });
        if (queueMessage === undefined) {
          console.warn('Block promise is undefined');
          return;
        }

        const block = queueMessage.block;
        if (block === undefined || block.blockHeight == null) {
          throw new Error(`Block ${currBlockHeight} failed to process or does not have block height`);
        }

        currBlockHeight = block.blockHeight;
        parentSpan.setAttribute('block_height', currBlockHeight);
        const blockHeightMessage: WorkerMessage = { type: WorkerMessageType.BLOCK_HEIGHT, data: currBlockHeight };
        parentPort?.postMessage(blockHeightMessage);
        streamMessageId = queueMessage.streamMessageId;

        METRICS.BLOCK_WAIT_DURATION.labels({ indexer: indexerName, type: workerContext.streamType }).observe(performance.now() - blockStartTime);

        await tracer.startActiveSpan(`Process Block ${currBlockHeight}`, async (runFunctionsSpan: Span) => {
          try {
            await indexer.runFunctions(block, functions, isHistorical, { provision: true });
          } finally {
            runFunctionsSpan.end();
          }
        });

        const postRunSpan = tracer.startSpan('Delete redis message and shift queue', {}, context.active());
        parentPort?.postMessage({ type: WorkerMessageType.STATUS, data: { status: IndexerStatus.RUNNING } });
        await workerContext.redisClient.deleteStreamMessage(streamKey, streamMessageId);
        await workerContext.queue.shift();

        METRICS.EXECUTION_DURATION.labels({ indexer: indexerName, type: workerContext.streamType }).observe(performance.now() - startTime);
        METRICS.LAST_PROCESSED_BLOCK_HEIGHT.labels({ indexer: indexerName, type: workerContext.streamType }).set(currBlockHeight);
        postRunSpan.end();
      } catch (err) {
        parentSpan.setAttribute('status', 'failed');
        parentPort?.postMessage({ type: WorkerMessageType.STATUS, data: { status: IndexerStatus.FAILING } });
        const error = err as Error;
        if (previousError !== error.message) {
          previousError = error.message;
          console.log(`Failed: ${indexerName} on block ${currBlockHeight}`, err);
        }
        const sleepSpan = tracer.startSpan('Sleep for 10 seconds after failing', {}, context.active());
        await sleep(10000);
        sleepSpan.end();
      } finally {
        const metricsSpan = tracer.startSpan('Record metrics after processing block', {}, context.active());

        const unprocessedMessageCount = await workerContext.redisClient.getUnprocessedStreamMessageCount(streamKey);
        METRICS.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName, type: workerContext.streamType }).set(unprocessedMessageCount);

        const memoryUsage = process.memoryUsage();
        METRICS.HEAP_TOTAL_ALLOCATION.labels({ indexer: indexerName, type: workerContext.streamType }).set(memoryUsage.heapTotal / (1024 * 1024));
        METRICS.HEAP_USED.labels({ indexer: indexerName, type: workerContext.streamType }).set(memoryUsage.heapUsed / (1024 * 1024));
        METRICS.PREFETCH_QUEUE_COUNT.labels({ indexer: indexerName, type: workerContext.streamType }).set(workerContext.queue.length);

        const metricsMessage: WorkerMessage = { type: WorkerMessageType.METRICS, data: await promClient.register.getMetricsAsJSON() };
        parentPort?.postMessage(metricsMessage);

        metricsSpan.end();
        parentSpan.end();
      }
    });
  }
}

async function generateQueuePromise (workerContext: WorkerContext, blockHeight: number, streamMessageId: string): Promise<QueueMessage> {
  const block = await workerContext.lakeClient.fetchBlock(blockHeight, workerContext.streamType === 'historical');
  return {
    block,
    streamMessageId
  };
}
