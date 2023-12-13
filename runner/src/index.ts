import { startServer as startMetricsServer } from './metrics';
import RedisClient from './redis-client';
import StreamHandler from './stream-handler';
import startServer from './service/runner-server';
import RunnerClient from './service/runner-client';


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
      RunnerClient.startStream({ streamId: 'test' }, (err, res) => {
        if (err) {
          console.error(`Error: ${err.message}`);
        } else {
          console.log('Response:', res);
        }
      });
      RunnerClient.listStreams({}, (err, res) => {
        if (err) {
          console.error(`Error: ${err.message}`);
        } else {
          console.log('Response:', res);
        }
      });
      const streamKeys = await redisClient.getStreams();

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
