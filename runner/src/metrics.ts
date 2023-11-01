import express from 'express';
import { Gauge, Histogram, Counter, AggregatorRegistry } from 'prom-client';

const UNPROCESSED_STREAM_MESSAGES = new Gauge({
  name: 'queryapi_runner_unprocessed_stream_messages',
  help: 'Number of Redis Stream messages not yet processed',
  labelNames: ['indexer', 'type'],
});

const EXECUTION_DURATION = new Histogram({
  name: 'queryapi_runner_execution_duration_milliseconds',
  help: 'Time taken to execute an indexer function',
  labelNames: ['indexer', 'type'],
});

const BLOCK_WAIT_DURATION = new Gauge({
  name: 'queryapi_runner_block_wait_duration_milliseconds',
  help: 'Time an indexer function waited for a block before processing',
  labelNames: ['indexer', 'type'],
});

const CACHE_HIT = new Counter({
  name: 'queryapi_runner_cache_hit',
  help: 'The number of times cache was hit successfully',
  labelNames: ['type']
});

const CACHE_MISS = new Counter({
  name: 'queryapi_runner_cache_miss',
  help: 'The number of times cache was missed',
  labelNames: ['type']
});

const FUNCTION_STATE_LOGGING_LATENCY = new promClient.Gauge({
  name: 'queryapi_runner_function_state_logging_milliseconds',
  help: 'Time an indexer function spent on writing state and creating write log promises',
  labelNames: ['indexer', 'type'],
});

const FUNCTION_VM_AND_CONTEXT_LATENCY = new promClient.Gauge({
  name: 'queryapi_runner_function_vm_and_context_building_milliseconds',
  help: 'Time an indexer function spent on preparing the vm and context object',
  labelNames: ['indexer', 'type'],
});

const FUNCTION_CODE_EXECUTION_LATENCY = new promClient.Gauge({
  name: 'queryapi_runner_function_code_execution_duration_milliseconds',
  help: 'Time an indexer function spent executing user code',
  labelNames: ['indexer', 'type'],
});

const FUNCTION_PROMISE_HANDLING_LATENCY = new promClient.Gauge({
  name: 'queryapi_runner_function_promise_handling_milliseconds',
  help: 'Time an indexer function waited for simultaneous promises to resolve',
  labelNames: ['indexer', 'type'],
});

const FUNCTION_OVERALL_EXECUTION_DURATION = new promClient.Gauge({
  name: 'queryapi_runner_function_overall_duration_milliseconds',
  help: 'Time an indexer function waited for a block before processing',
  labelNames: ['indexer', 'type'],
});

const UNPROCESSED_STREAM_MESSAGES = new promClient.Gauge({
  name: 'queryapi_runner_unprocessed_stream_messages',
  help: 'Number of Redis Stream messages not yet processed',
  labelNames: ['indexer', 'type'],
});

const LAST_PROCESSED_BLOCK = new promClient.Gauge({
  name: 'queryapi_runner_last_processed_block',
  help: 'The last block processed by an indexer function',
  labelNames: ['indexer', 'type'],
});

const EXECUTION_DURATION = new promClient.Histogram({
  name: 'queryapi_runner_execution_duration_milliseconds',
  help: 'Time taken to execute an indexer function',
  labelNames: ['indexer', 'type'],
});

export const METRICS = {
  BLOCK_WAIT_DURATION,
  CACHE_HIT,
  CACHE_MISS,
  FUNCTION_STATE_LOGGING_LATENCY,
  FUNCTION_VM_AND_CONTEXT_LATENCY,
  FUNCTION_CODE_EXECUTION_LATENCY,
  FUNCTION_PROMISE_HANDLING_LATENCY,
  FUNCTION_OVERALL_EXECUTION_DURATION,
  UNPROCESSED_STREAM_MESSAGES,
  LAST_PROCESSED_BLOCK,
  EXECUTION_DURATION,

};

const aggregatorRegistry = new AggregatorRegistry();
const workerMetrics: Record<number, string> = {};

export const registerWorkerMetrics = (workerId: number, metrics: string): void => {
  workerMetrics[workerId] = metrics;
};

export const startServer = async (): Promise<void> => {
  const app = express();

  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', aggregatorRegistry.contentType);

    const metrics = await AggregatorRegistry.aggregate(Object.values(workerMetrics)).metrics();
    res.send(metrics);
  });

  app.listen(process.env.PORT, () => {
    console.log(`Metrics server running on http://localhost:${process.env.PORT}`);
  });
};
