import { Worker } from 'worker_threads';

import * as metrics from './metrics';
import RedisClient from './redis-client';

const redisClient = new RedisClient();

metrics.startServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

const STREAM_HANDLER_THROTTLE_MS = 500;

type StreamHandlers = Record<string, Worker>;

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
        // const handler = processStream(streamKey);
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
