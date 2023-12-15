import { startServer as startMetricsServer } from './metrics';
import RedisClient from './redis-client';
import StreamHandler from './stream-handler';
import startServer from './service/runner-server';

const STREAM_HANDLER_THROTTLE_MS = 500;

const redisClient = new RedisClient();

startMetricsServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

type StreamHandlers = Record<string, StreamHandler>;

void (async function main () {
  startServer();

  try {
    const streamHandlers: StreamHandlers = {};

    while (true) {
      // const streamKeys = await redisClient.getStreams();
      const streamKeys: string[] = [];

      streamKeys.forEach((streamKey) => {
        if (streamHandlers[streamKey] !== undefined) {
          return;
        }

        const streamHandler = new StreamHandler(streamKey);

        streamHandlers[streamKey] = streamHandler;
      });

      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await redisClient.disconnect();
  }
})();
