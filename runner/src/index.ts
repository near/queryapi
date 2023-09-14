import { Worker } from 'worker_threads';

import { METRICS, startServer as startMetricsServer } from './metrics';
import RedisClient from './redis-client';

const redisClient = new RedisClient();

startMetricsServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

const STREAM_HANDLER_THROTTLE_MS = 500;

type StreamHandlers = Record<string, Worker>;

interface Metric {
  type: keyof typeof METRICS
  labels: Record<string, string>
  value: number
};

void (async function main () {
  try {
    const streamHandlers: StreamHandlers = {};

    while (true) {
      const streamKeys = await redisClient.getStreams();

      streamKeys.forEach((streamKey) => {
        if (streamHandlers[streamKey] !== undefined) {
          return;
        }

        const worker = new Worker('./dist/worker.js');
        worker.postMessage({ streamKey });

        worker.on('message', (message: Metric) => {
          METRICS[message.type].labels(message.labels).set(message.value);
        });

        streamHandlers[streamKey] = worker;
      });

      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await redisClient.disconnect();
  }
})();
