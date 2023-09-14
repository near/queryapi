import Indexer from './indexer';
import * as metrics from './metrics';
import RedisClient from './redis-client';

const indexer = new Indexer('mainnet');
const redisClient = new RedisClient();

metrics.startServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

const STREAM_HANDLER_THROTTLE_MS = 500;

const processStream = async (streamKey: string): Promise<void> => {
  console.log('Started processing stream: ', streamKey);

  let indexerName = '';
  let startTime = 0;
  let endTime = null;

  const streamType = redisClient.getStreamType(streamKey);

  while (true) {
    try {
      endTime = null;
      startTime = performance.now();

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

      endTime = performance.now();

      console.log(`Success: ${indexerName}`);
    } catch (err) {
      console.log(`Failed: ${indexerName}`, err);
    } finally {
      metrics.EXECUTION_DURATION.labels({ indexer: indexerName, type: streamType }).set(endTime ? endTime - startTime : -1);
    }
  }
};

type StreamHandlers = Record<string, Promise<void>>;

void (async function main () {
  try {
    const streamHandlers: StreamHandlers = {};

    while (true) {
      const streamKeys = await redisClient.getStreams();

      streamKeys.forEach((streamKey) => {
        if (streamHandlers[streamKey] !== undefined) {
          return;
        }

        const handler = processStream(streamKey);
        streamHandlers[streamKey] = handler;
      });

      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await redisClient.disconnect();
  }
})();
