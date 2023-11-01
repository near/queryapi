import { isMainThread, parentPort, workerData } from 'worker_threads';
import promClient from 'prom-client';

import Indexer from '../indexer';
import RedisClient from '../redis-client';
import { METRICS } from '../metrics';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}

const indexer = new Indexer('mainnet');
const redisClient = new RedisClient();

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

void (async function main () {
  const { streamKey } = workerData;

  console.log('Started processing stream: ', streamKey);

  let indexerName = '';
  const streamType = redisClient.getStreamType(streamKey);
  const isHistorical = streamType === 'historical';

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
