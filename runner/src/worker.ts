import { parentPort } from 'worker_threads';

import Indexer from './indexer';
import RedisClient from './redis-client';
import * as metrics from './metrics';

const indexer = new Indexer('mainnet');
const redisClient = new RedisClient();

// eslint-disable-next-line
parentPort?.on('message', async ({ streamKey }) => {
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

      metrics.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName, type: streamType }).set(unprocessedMessages?.length ?? 0);
      metrics.EXECUTION_DURATION.labels({ indexer: indexerName, type: streamType }).set(performance.now() - startTime);

      console.log(`Success: ${indexerName}`);
    } catch (err) {
      console.log(`Failed: ${indexerName}`, err);
    }
  }
});
