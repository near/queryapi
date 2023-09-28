import express from 'express';
import promClient from 'prom-client';

const UNPROCESSED_STREAM_MESSAGES = new promClient.Gauge({
  name: 'queryapi_runner_unprocessed_stream_messages',
  help: 'Number of Redis Stream messages not yet processed',
  labelNames: ['indexer', 'type'],
});

const EXECUTION_DURATION = new promClient.Gauge({
  name: 'queryapi_runner_execution_duration_milliseconds',
  help: 'Time taken to execute an indexer function',
  labelNames: ['indexer', 'type'],
});

const CACHE_HIT_STREAMER_MESSAGE = new promClient.Counter({
  name: 'redis_cache_hit_for_streamer_message',
  help: 'The number of times the streamer message cache was hit',
  labelNames: ['type']
});

const CACHE_MISS_STREAMER_MESSAGE = new promClient.Counter({
  name: 'redis_cache_miss_for_streamer_message',
  help: 'The number of times the streamer message cache was missed',
  labelNames: ['type']
});

export const METRICS = {
  EXECUTION_DURATION,
  UNPROCESSED_STREAM_MESSAGES,
  CACHE_HIT_STREAMER_MESSAGE,
  CACHE_MISS_STREAMER_MESSAGE
};

export const startServer = async (): Promise<void> => {
  const app = express();

  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', promClient.register.contentType);

    const metrics = await promClient.register.metrics();
    res.send(metrics);
  });

  app.listen(process.env.PORT, () => {
    console.log(`Metrics server running on http://localhost:${process.env.PORT}`);
  });
};
