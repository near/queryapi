import { startServer as startMetricsServer } from './metrics';
import RedisClient from './redis-client';
import startRunnerServer from './server/runner-server';
import StreamHandler from './stream-handler';

const redisClient = new RedisClient();
let runnerServer;

startMetricsServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

type StreamHandlers = Record<string, StreamHandler>;

void (async function main () {
  try {
    const streamHandlers: StreamHandlers = {};
    let STREAM_HANDLER_THROTTLE_MS = 500;

    const version = process.env.RUNNER_VERSION ?? 'V1';
    if (version === 'V2') {
      console.log('Starting Runner in V2 mode.');
      STREAM_HANDLER_THROTTLE_MS = 360000; // 1 hour
      runnerServer = startRunnerServer();
    } else if (version === 'V1') {
      console.log('Starting Runner in V1 mode.');
    } else {
      console.error('Unknown version', version);
      process.exit(1);
    }

    while (true) {
      if (version === 'V1') {
        const streamKeys = await redisClient.getStreams();

        streamKeys.forEach((streamKey) => {
          if (streamHandlers[streamKey] !== undefined) {
            return;
          }

          const streamHandler = new StreamHandler(streamKey);

          streamHandlers[streamKey] = streamHandler;
        });
      }

      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await redisClient.disconnect();
    runnerServer?.forceShutdown();
  }
})();
