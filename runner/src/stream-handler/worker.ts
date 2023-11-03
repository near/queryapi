import { isMainThread, parentPort, workerData } from 'worker_threads';
import promClient from 'prom-client';

import Indexer from '../indexer';
import RedisClient from '../redis-client';
import { METRICS } from '../metrics';
import type { Block } from '@near-lake/primitives';
import LakeClient from '../lake-client/lake-client';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}

const HISTORICAL_BATCH_SIZE = 100;
const indexer = new Indexer();
const redisClient = new RedisClient();
const lakeClient = new LakeClient();
let isHistorical = false;

interface QueueMessage {
  block: Block
  streamId: string
}
const queue: Array<Promise<QueueMessage>> = [];

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

void (async function main () {
  const { streamKey } = workerData;

  console.log('Started processing stream: ', streamKey);

  const streamType = redisClient.getStreamType(streamKey);
  isHistorical = (streamType === 'historical');

  await handleStream(streamKey);
})();

async function handleStream (streamKey: string): Promise<void> {
  void blockQueueProducer(queue, streamKey);
  void blockQueueConsumer(queue, streamKey);
}

async function blockQueueProducer (queue: Array<Promise<QueueMessage>>, streamKey: string): Promise<void> {
  while (true) {
    const preFetchCount = HISTORICAL_BATCH_SIZE - queue.length;
    if (preFetchCount <= 0) {
      await sleep(300); // Wait for more messages in array to process
      continue;
    }
    const messages = await redisClient.getStreamMessage(streamKey, preFetchCount);
    if (messages == null) {
      await sleep(1000); // Wait for new messages to appear in stream
      continue;
    }
    console.log(`Fetched ${messages?.length} messages from stream ${streamKey}`);

    for (const streamMessage of messages) {
      const { id, message } = streamMessage;
      fetchAndQueue(queue, Number(message.block_height), id);
    }
  }
}

async function blockQueueConsumer (queue: Array<Promise<QueueMessage>>, streamKey: string): Promise<void> {
  const streamType = redisClient.getStreamType(streamKey);
  const indexerConfig = await redisClient.getStreamStorage(streamKey);
  const indexerName = `${indexerConfig.account_id}/${indexerConfig.function_name}`;
  const functions = {
    [indexerName]: {
      account_id: indexerConfig.account_id,
      function_name: indexerConfig.function_name,
      code: indexerConfig.code,
      schema: indexerConfig.schema,
      provisioned: false,
    },
  };

  while (true) {
    const startTime = performance.now();
    const blockStartTime = startTime;
    const queueMessage = await queue.shift();
    if (queueMessage === undefined) {
      await sleep(1000); // Wait for new message to process
      continue;
    }
    const { block, streamId } = queueMessage;

    if (block === undefined || block.blockHeight == null) {
      console.error('Block failed to process or does not have block height', block);
      continue;
    }
    METRICS.BLOCK_WAIT_DURATION.labels({ indexer: indexerName, type: streamType }).set(performance.now() - blockStartTime);

    try {
      await indexer.runFunctions(block, functions, false, { provision: true });
      METRICS.LAST_PROCESSED_BLOCK.labels({ indexer: indexerName, type: streamType }).set(block.blockHeight);

      await redisClient.deleteStreamMessage(streamKey, streamId);

      METRICS.EXECUTION_DURATION.labels({ indexer: indexerName, type: streamType }).observe(performance.now() - startTime);

      console.log(`Success: ${indexerName}`);
    } catch (err) {
      await sleep(10000);
      console.log(`Failed: ${indexerName}`, err);
    } finally {
      const unprocessedMessages = await redisClient.getUnprocessedStreamMessages(streamKey, streamId);
      METRICS.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName, type: streamType }).set(unprocessedMessages?.length ?? 0);

      parentPort?.postMessage(await promClient.register.getMetricsAsJSON());
    }
  }
}

function fetchAndQueue (queue: Array<Promise<QueueMessage>>, blockHeight: number, id: string): void {
  queue.push(transformBlockToQueueMessage(blockHeight, id));
}

async function transformBlockToQueueMessage (blockHeight: number, streamId: string): Promise<QueueMessage> {
  const block = await lakeClient.fetchBlock(blockHeight, isHistorical);
  return {
    block,
    streamId
  };
}
