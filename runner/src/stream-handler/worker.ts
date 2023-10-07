import { isMainThread, parentPort, workerData } from 'worker_threads';

import Indexer from '../indexer';
import RedisClient from '../redis-client';
import { type Message } from './types';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}

const indexer = new Indexer('mainnet', { parentPort });
const redisClient = new RedisClient();

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

void (async function main () {
  const { streamKey } = workerData;

  console.log('Started processing stream: ', streamKey);

  let indexerName = '';

  while (true) {
    try {
      const startTime = performance.now();
      const streamType = redisClient.getStreamType(streamKey);

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
      await indexer.runFunctions(Number(message.block_height), functions, false, {
        provision: true,
      });

      await redisClient.deleteStreamMessage(streamKey, id);

      const unprocessedMessages = await redisClient.getUnprocessedStreamMessages(streamKey);

      parentPort?.postMessage({
        type: 'UNPROCESSED_STREAM_MESSAGES',
        labels: { indexer: indexerName, type: streamType },
        value: unprocessedMessages?.length ?? 0,
      } satisfies Message);

      parentPort?.postMessage({
        type: 'EXECUTION_DURATION',
        labels: { indexer: indexerName, type: streamType },
        value: performance.now() - startTime,
      } satisfies Message);

      console.log(`Success: ${indexerName}`);
    } catch (err) {
      await sleep(10000);
      console.log(`Failed: ${indexerName}`, err);
    }
  }
})();
