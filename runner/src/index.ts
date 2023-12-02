import { METRICS, registerWorkerMetrics, startServer as startMetricsServer } from './metrics';
import RedisClient from './redis-client';
import StreamHandler from './stream-handler';
import promClient from 'prom-client';

const redisClient = new RedisClient();

startMetricsServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

const STREAM_HANDLER_THROTTLE_MS = 500;

type StreamHandlers = Record<string, StreamHandler>;

void (async function main () {
  try {
    const streamHandlers: StreamHandlers = {};

    while (true) {
      const streamKeys = await redisClient.getStreams();
      METRICS.WORKER_THREAD_COUNT.set(streamKeys.length);
      const metrics = await promClient.register.getMetricsAsJSON();
      registerWorkerMetrics(0, metrics as any);

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
