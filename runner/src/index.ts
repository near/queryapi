import StreamHandler from './stream-handler';
import RedisClient from './redis-client';
import * as metrics from './metrics';

const redisClient = new RedisClient();

metrics.startServer().catch((err) => {
  console.error('Failed to start metrics server', err);
  // process.exit(1);
});

// const BATCH_SIZE = 1;
// const STREAM_THROTTLE_MS = 250;
const STREAM_HANDLER_THROTTLE_MS = 500;

type StreamHandlers = Record<string, StreamHandler>;

void (async function main () {
  try {
    const streamHandlers: StreamHandlers = {};

    while (true) {
      // it would be ideal if we had the whole contract here
      // then it would be the job of this application to ensure the configuration is live
      const indexers = await redisClient.getIndexers();

      indexers.forEach((indexerName) => {
        // should also check if the indexer version has changed
        // expose version in contract set to blockHeight
        if (streamHandlers[indexerName] !== undefined) {
          const handler = streamHandlers[indexerName];
          if (!handler.healthy()) {
            handler.stop();
          }
          return;
        }

        // check provisioning status and provision if necessary

        const handler = new StreamHandler(indexerName);
        handler.start();
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
