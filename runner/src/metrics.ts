import express from 'express';
import { Gauge, Histogram, Counter, AggregatorRegistry, register } from 'prom-client';

import logger from './logger';

const HEAP_TOTAL_ALLOCATION = new Gauge({
  name: 'queryapi_runner_heap_total_allocation_megabytes',
  help: 'Size of heap allocation for indexer function',
  labelNames: ['indexer'],
});

const HEAP_USED = new Gauge({
  name: 'queryapi_runner_heap_used_megabytes',
  help: 'Size of used heap space for indexer function',
  labelNames: ['indexer'],
});

const PREFETCH_QUEUE_COUNT = new Gauge({
  name: 'queryapi_runner_prefetch_queue_count',
  help: 'Count of items in prefetch queue for indexer function',
  labelNames: ['indexer'],
});

const BLOCK_WAIT_DURATION = new Histogram({
  name: 'queryapi_runner_block_wait_duration_seconds',
  help: 'Time an indexer function waited for a block before processing',
  labelNames: ['indexer'],
  buckets: [0.001, 0.01, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30]
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
  labelNames: ['indexer'],
});

const LAST_PROCESSED_BLOCK_HEIGHT = new Gauge({
  name: 'queryapi_runner_last_processed_block_height',
  help: 'Previous block height processed by an indexer',
  labelNames: ['indexer'],
});

const EXECUTION_DURATION = new Histogram({
  name: 'queryapi_runner_execution_duration_seconds',
  help: 'Time taken to execute an indexer function',
  labelNames: ['indexer'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5, 30, 60, 120]
});

const LOGS_COUNT = new Counter({
  name: 'queryapi_runner_logs_count',
  help: 'Number of messages logged',
  labelNames: ['level'],
});

const EXECUTOR_UP = new Counter({
  name: 'queryapi_runner_executor_up',
  help: 'Incremented each time the executor loop runs to indicate whether the job is functional',
  labelNames: ['indexer'],
});

const SUCCESSFUL_EXECUTIONS = new Counter({
  name: 'queryapi_runner_successful_executions',
  help: 'Count of successful executions of an indexer function',
  labelNames: ['indexer'],
});

const FAILED_EXECUTIONS = new Counter({
  name: 'queryapi_runner_failed_executions',
  help: 'Count of failed executions of an indexer function',
  labelNames: ['indexer'],
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
  LOGS_COUNT,
  EXECUTOR_UP,
  SUCCESSFUL_EXECUTIONS,
  FAILED_EXECUTIONS,
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

    const mainThreadMetrics = await register.getMetricsAsJSON();
    const metrics = await AggregatorRegistry.aggregate([...Array.from(workerMetrics.values()), mainThreadMetrics]).metrics();

    res.send(metrics);
  });

  app.listen(process.env.PORT, () => {
    logger.info(`Metrics server running on http://localhost:${process.env.PORT}`);
  });
};
