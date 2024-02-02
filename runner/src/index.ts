import { startServer as startMetricsServer } from './metrics';
import RedisClient from './redis-client';
import startRunnerServer from './server/runner-server';
import StreamHandler from './stream-handler';

const executors = new Map<string, StreamHandler>();
const redisClient = new RedisClient();
const grpcServer = startRunnerServer(executors);

startMetricsServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

void (async function main () {
  try {
    const STREAM_HANDLER_THROTTLE_MS = 500;
    while (true) {
      const streamKeys = await redisClient.getStreams();
      streamKeys.forEach((streamKey) => {
        if (executors.get(streamKey) === undefined && streamKey.includes('dataplatform.near/social_feed2')) {
          const streamHandler = new StreamHandler(streamKey);
          executors.set(streamKey, streamHandler);
        }
      });
      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await redisClient.disconnect();
    grpcServer.forceShutdown();
  }
})();
