import Indexer from './indexer';
import * as metrics from './metrics';
import RedisClient from './redis-client';

const indexer = new Indexer('mainnet');
const redisClient = new RedisClient();

metrics.startServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

const STREAM_HANDLER_THROTTLE_MS = 500;

const runFunction = async (indexerName: string, blockHeight: string): Promise<void> => {
  const { account_id: accountId, function_name: functionName, code, schema } = await redisClient.getIndexerData(
    indexerName,
  );

  const functions = {
    [indexerName]: {
      account_id: accountId,
      function_name: functionName,
      code,
      schema,
      provisioned: false,
    },
  };

  await indexer.runFunctions(Number(blockHeight), functions, false, {
    provision: true,
  });
};

const processStream = async (indexerName: string): Promise<void> => {
  console.log('Started processing stream', indexerName);
  while (true) {
    try {
      const startTime = performance.now();

      const messages = await redisClient.getNextStreamMessage(indexerName);

      if (messages == null) {
        continue;
      }

      const [{ id, message }] = messages;

      await runFunction(indexerName, message.block_height);

      await redisClient.acknowledgeStreamMessage(indexerName, id);

      const endTime = performance.now();

      metrics.EXECUTION_DURATION.labels({ indexer: indexerName }).set(endTime - startTime);

      const unprocessedMessages = await redisClient.getUnprocessedStreamMessages(indexerName);
      metrics.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName }).set(unprocessedMessages?.length ?? 0);

      console.log(`Success: ${indexerName}`);
    } catch (err) {
      console.log(`Failed: ${indexerName}`, err);
    }
  }
};

type StreamHandlers = Record<string, Promise<void>>;

void (async function main () {
  try {
    const streamHandlers: StreamHandlers = {};

    while (true) {
      const indexers = await redisClient.getIndexers();

      indexers.forEach((indexerName) => {
        if (streamHandlers[indexerName] !== undefined) {
          return;
        }

        const handler = processStream(indexerName);
        streamHandlers[indexerName] = handler;
      });

      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await redisClient.disconnect();
  }
})();
