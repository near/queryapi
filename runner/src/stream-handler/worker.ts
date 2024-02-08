import { isMainThread, parentPort, workerData } from 'worker_threads';
import promClient from 'prom-client';

import Indexer from '../indexer';
import RedisClient, { type StreamType } from '../redis-client';
import { METRICS } from '../metrics';
import type { Block } from '@near-lake/primitives';
import LakeClient from '../lake-client';
import { WorkerMessageType, type IndexerConfig, type WorkerMessage } from './stream-handler';

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
  let indexerName = streamKey.split(':')[0];
  let currBlockHeight = 0;

  while (true) {
    try {
      if (workerContext.queue.length === 0) {
        await sleep(100);
        continue;
      }
      const startTime = performance.now();
      // TODO: Remove redis storage call after full V2 migration
      const indexerConfig = config ?? await workerContext.redisClient.getStreamStorage(streamKey);
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
      const blockStartTime = performance.now();
      const queueMessage = await workerContext.queue.at(0);
      if (queueMessage === undefined) {
        continue;
      }
      const block = queueMessage.block;
      currBlockHeight = block.blockHeight;
      const blockHeightMessage: WorkerMessage = { type: WorkerMessageType.BLOCK_HEIGHT, data: currBlockHeight };
      parentPort?.postMessage(blockHeightMessage);
      streamMessageId = queueMessage.streamMessageId;

      if (block === undefined || block.blockHeight == null) {
        console.error('Block failed to process or does not have block height', block);
        continue;
      }
      METRICS.BLOCK_WAIT_DURATION.labels({ indexer: indexerName, type: workerContext.streamType }).observe(performance.now() - blockStartTime);
      await indexer.runFunctions(block, functions, isHistorical, { provision: true });
      await workerContext.redisClient.deleteStreamMessage(streamKey, streamMessageId);
      await workerContext.queue.shift();

      METRICS.EXECUTION_DURATION.labels({ indexer: indexerName, type: workerContext.streamType }).observe(performance.now() - startTime);

      METRICS.LAST_PROCESSED_BLOCK_HEIGHT.labels({ indexer: indexerName, type: workerContext.streamType }).set(currBlockHeight);

      console.log(`Success: ${indexerName} ${workerContext.streamType} on block ${currBlockHeight}}`);
    } catch (err) {
      await sleep(10000);
      console.log(`Failed: ${indexerName} ${workerContext.streamType} on block ${currBlockHeight}`, err);
      throw err;
    } finally {
      const unprocessedMessageCount = await workerContext.redisClient.getUnprocessedStreamMessageCount(streamKey);
      METRICS.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName, type: workerContext.streamType }).set(unprocessedMessageCount);

      const metricsMessage: WorkerMessage = { type: WorkerMessageType.METRICS, data: await promClient.register.getMetricsAsJSON() };
      parentPort?.postMessage(metricsMessage);
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
