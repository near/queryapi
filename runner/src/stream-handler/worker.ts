import { isMainThread, parentPort, workerData } from 'worker_threads';
import promClient from 'prom-client';

import Indexer from '../indexer';
import RedisClient from '../redis-client';
import { METRICS } from '../metrics';
import type { StreamerMessage } from '@near-lake/primitives';
import S3StreamerMessageFetcher from '../lake-client/lake-client';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}

const HISTORICAL_BATCH_SIZE = 100;
const indexer = new Indexer('mainnet', { parentPort });
const redisClient = new RedisClient();
const s3StreamerMessageFetcher = new S3StreamerMessageFetcher();

interface QueueMessage {
  streamerMessage: StreamerMessage
  streamId: string
}
const queue: Array<Promise<QueueMessage>> = [];

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

void (async function main () {
  const { streamKey } = workerData;

  console.log('Started processing stream: ', streamKey);

  let indexerName = '';
  const streamType = redisClient.getStreamType(streamKey);
  const isHistorical = streamType === 'historical';
  if (!isHistorical) {
    await handleHistoricalStream(streamKey);
    return;
  }

  while (true) {
    try {
      const startTime = performance.now();

      const messages = await redisClient.getNextStreamMessage(streamKey);
      const indexerConfig = await redisClient.getStreamStorage(streamKey);

      indexerName = `${indexerConfig.account_id}/${indexerConfig.function_name}`;

      if (messages == null) {
        await sleep(1000);
        continue;
      }

      const [{ id, message }] = messages;

      const functions = {
        [indexerName]: {
          account_id: indexerConfig.account_id,
          function_name: indexerConfig.function_name,
          code: indexerConfig.code,
          schema: indexerConfig.schema,
          provisioned: false,
        },
      };
      await indexer.runFunctions(Number(message.block_height), functions, isHistorical, {
        provision: true,
      });

      await redisClient.deleteStreamMessage(streamKey, id);

      METRICS.EXECUTION_DURATION.labels({ indexer: indexerName, type: streamType }).observe(performance.now() - startTime);

      console.log(`Success: ${indexerName}`);
    } catch (err) {
      await sleep(10000);
      console.log(`Failed: ${indexerName}`, err);
    } finally {
      const unprocessedMessages = await redisClient.getUnprocessedStreamMessages(streamKey);
      METRICS.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName, type: streamType }).set(unprocessedMessages?.length ?? 0);
      parentPort?.postMessage(await promClient.register.getMetricsAsJSON());
    }
  }
})();

async function handleHistoricalStream (streamKey: string): Promise<void> {
  void historicalStreamerMessageQueueProducer(queue, streamKey);
  void historicalStreamerMessageQueueConsumer(queue, streamKey);
}

function incrementId (id: string): string {
  const [main, sequence] = id.split('-');
  return `${Number(main) + 1}-${sequence}`;
}

async function historicalStreamerMessageQueueProducer (queue: Array<Promise<QueueMessage>>, streamKey: string): Promise<void> {
  let currentBlockHeight: string = '0';

  while (true) {
    const preFetchCount = HISTORICAL_BATCH_SIZE - queue.length;
    if (preFetchCount <= 0) {
      await sleep(300);
      continue;
    }
    const messages = await redisClient.getNextStreamMessage(streamKey, preFetchCount, currentBlockHeight);
    console.log('Messages fetched: ', messages?.length);

    if (messages == null) {
      await sleep(100);
      continue;
    }

    for (const streamMessage of messages) {
      const { id, message } = streamMessage;
      fetchAndQueue(queue, Number(message.block_height), id);
    }

    currentBlockHeight = incrementId(messages[messages.length - 1].id);
  }
}

async function historicalStreamerMessageQueueConsumer (queue: Array<Promise<QueueMessage>>, streamKey: string): Promise<void> {
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
      await sleep(500);
      continue;
    }
    const { streamerMessage, streamId } = queueMessage;

    if (streamerMessage === undefined || streamerMessage?.block.header.height == null) {
      console.error('Streamer message does not have block height', streamerMessage);
      continue;
    }
    console.log('Block wait Duration: ', performance.now() - startTime);
    parentPort?.postMessage({
      type: 'BLOCK_WAIT_DURATION',
      labels: { indexer: indexerName, type: streamType },
      value: performance.now() - blockStartTime,
    } satisfies Message);

    const functionStartTime = performance.now();
    await indexer.runFunctions(streamerMessage.block.header.height, functions, false, { provision: true }, streamerMessage);
    console.log('Function Code Execution Duration: ', performance.now() - functionStartTime);
    parentPort?.postMessage({
      type: 'FUNCTION_OVERALL_EXECUTION_DURATION',
      labels: { indexer: indexerName, type: streamType },
      value: performance.now() - functionStartTime,
    } satisfies Message);

    // await redisClient.deleteStreamMessage(streamKey, streamId);
    // Can just be streamId if above line is running
    const unprocessedMessages = await redisClient.getUnprocessedStreamMessages(streamKey, incrementId(streamId));

      parentPort?.postMessage({
        type: 'UNPROCESSED_STREAM_MESSAGES',
        labels: { indexer: indexerName, type: streamType },
        value: unprocessedMessages?.length ?? 0,
      } satisfies Message);
    }
  }
})();

async function handleHistoricalStream (streamKey: string): Promise<void> {
  void historicalStreamerMessageQueueProducer(queue, streamKey);
  void historicalStreamerMessageQueueConsumer(queue, streamKey);
}

function incrementId (id: string): string {
  const [main, sequence] = id.split('-');
  return `${Number(main) + 1}-${sequence}`;
}

async function historicalStreamerMessageQueueProducer (queue: Array<Promise<QueueMessage>>, streamKey: string): Promise<void> {
  let currentBlockHeight: string = '0';

  while (true) {
    const preFetchCount = HISTORICAL_BATCH_SIZE - queue.length;
    if (preFetchCount <= 0) {
      await sleep(300);
      continue;
    }
    const messages = await redisClient.getNextStreamMessage(streamKey, preFetchCount, currentBlockHeight);
    if (messages == null) {
      await sleep(100);
      continue;
    }
    console.log(`Fetched ${messages?.length} messages from stream ${streamKey}`);

    for (const streamMessage of messages) {
      const { id, message } = streamMessage;
      fetchAndQueue(queue, Number(message.block_height), id);
    }

    currentBlockHeight = incrementId(messages[messages.length - 1].id);
  }
}

async function historicalStreamerMessageQueueConsumer (queue: Array<Promise<QueueMessage>>, streamKey: string): Promise<void> {
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
      await sleep(500);
      continue;
    }
    const { streamerMessage, streamId } = queueMessage;

    if (streamerMessage === undefined || streamerMessage?.block.header.height == null) {
      console.error('Streamer message does not have block height', streamerMessage);
      continue;
    }
    parentPort?.postMessage({
      type: 'BLOCK_WAIT_DURATION',
      labels: { indexer: indexerName, type: streamType },
      value: performance.now() - blockStartTime,
    } satisfies Message);

    try {
      await indexer.runFunctions(streamerMessage.block.header.height, functions, false, { provision: true }, streamerMessage);
    } catch (error) {
      console.error('Error running function', error);
    }

    // await redisClient.deleteStreamMessage(streamKey, streamId);
    // Can just be streamId if above line is running
    const unprocessedMessages = await redisClient.getUnprocessedStreamMessages(streamKey, incrementId(streamId));

    parentPort?.postMessage({
      type: 'UNPROCESSED_STREAM_MESSAGES',
      labels: { indexer: indexerName, type: streamType },
      value: unprocessedMessages?.length ?? 0,
    } satisfies Message);

    parentPort?.postMessage({
      type: 'LAST_PROCESSED_BLOCK',
      labels: { indexer: indexerName, type: streamType },
      value: streamerMessage.block.header.height,
    } satisfies Message);

    parentPort?.postMessage({
      type: 'EXECUTION_DURATION',
      labels: { indexer: indexerName, type: streamType },
      value: performance.now() - startTime,
    } satisfies Message);
  }
}

function fetchAndQueue (queue: Array<Promise<QueueMessage>>, blockHeight: number, id: string): void {
  queue.push(transformStreamerMessageToQueueMessage(blockHeight, id));
}

async function transformStreamerMessageToQueueMessage (blockHeight: number, streamId: string): Promise<QueueMessage> {
  const streamerMessage = await s3StreamerMessageFetcher.buildStreamerMessage(blockHeight);
  return {
    streamerMessage,
    streamId
  };
}
