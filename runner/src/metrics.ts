import express from 'express';
import { Gauge, Histogram, Counter, AggregatorRegistry } from 'prom-client';

const HEAP_TOTAL_ALLOCATION = new Gauge({
  name: 'queryapi_runner_heap_total_allocation_megabytes',
  help: 'Size of heap allocation for indexer function',
  labelNames: ['indexer', 'type'],
});

const HEAP_USED = new Gauge({
  name: 'queryapi_runner_heap_used_megabytes',
  help: 'Size of used heap space for indexer function',
  labelNames: ['indexer', 'type'],
});

const PREFETCH_QUEUE_COUNT = new Gauge({
  name: 'queryapi_runner_prefetch_queue_count',
  help: 'Count of items in prefetch queue for indexer function',
  labelNames: ['indexer', 'type'],
});

const BLOCK_WAIT_DURATION = new Histogram({
  name: 'queryapi_runner_block_wait_duration_milliseconds',
  help: 'Time an indexer function waited for a block before processing',
  labelNames: ['indexer', 'type'],
  buckets: [1, 10, 100, 300, 500, 1000, 3000, 5000, 10000, 30000],
});

const CACHE_HIT = new Counter({
  name: 'queryapi_runner_cache_hit',
  help: 'The number of times cache was hit successfully'
});

const CACHE_MISS = new Counter({
  name: 'queryapi_runner_cache_miss',
  help: 'The number of times cache was missed'
});

const UNPROCESSED_STREAM_MESSAGES = new Gauge({
  name: 'queryapi_runner_unprocessed_stream_messages',
  help: 'Number of Redis Stream messages not yet processed',
  labelNames: ['indexer', 'type'],
});

const LAST_PROCESSED_BLOCK_HEIGHT = new Gauge({
  name: 'queryapi_runner_last_processed_block_height',
  help: 'Previous block height processed by an indexer',
  labelNames: ['indexer', 'type'],
});

const EXECUTION_DURATION = new Histogram({
  name: 'queryapi_runner_execution_duration_milliseconds',
  help: 'Time taken to execute an indexer function',
  labelNames: ['indexer', 'type'],
});

export const METRICS = {
  HEAP_TOTAL_ALLOCATION,
  HEAP_USED,
  PREFETCH_QUEUE_COUNT,
  BLOCK_WAIT_DURATION,
  CACHE_HIT,
  CACHE_MISS,
  UNPROCESSED_STREAM_MESSAGES,
  LAST_PROCESSED_BLOCK_HEIGHT,
  EXECUTION_DURATION,
};

const aggregatorRegistry = new AggregatorRegistry();
const workerMetrics = new Map<number, string>();

export const registerWorkerMetrics = (workerId: number, metrics: string): void => {
  workerMetrics.set(workerId, metrics);
};

export const deregisterWorkerMetrics = (workerId: number): void => {
  workerMetrics.delete(workerId);
};

export const startServer = async (): Promise<void> => {
  const app = express();

  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', aggregatorRegistry.contentType);

    const metrics = await AggregatorRegistry.aggregate(Array.from(workerMetrics.values())).metrics();
    res.send(metrics);
  });

  app.listen(process.env.PORT, () => {
    console.log(`Metrics server running on http://localhost:${process.env.PORT}`);
  });
};
