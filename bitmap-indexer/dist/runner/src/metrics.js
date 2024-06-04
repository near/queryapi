"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = exports.deregisterWorkerMetrics = exports.registerWorkerMetrics = exports.METRICS = void 0;
const express_1 = __importDefault(require("express"));
const prom_client_1 = require("prom-client");
const logger_1 = __importDefault(require("./logger"));
const HEAP_TOTAL_ALLOCATION = new prom_client_1.Gauge({
    name: 'queryapi_runner_heap_total_allocation_megabytes',
    help: 'Size of heap allocation for indexer function',
    labelNames: ['indexer'],
});
const HEAP_USED = new prom_client_1.Gauge({
    name: 'queryapi_runner_heap_used_megabytes',
    help: 'Size of used heap space for indexer function',
    labelNames: ['indexer'],
});
const PREFETCH_QUEUE_COUNT = new prom_client_1.Gauge({
    name: 'queryapi_runner_prefetch_queue_count',
    help: 'Count of items in prefetch queue for indexer function',
    labelNames: ['indexer'],
});
const BLOCK_WAIT_DURATION = new prom_client_1.Histogram({
    name: 'queryapi_runner_block_wait_duration_milliseconds',
    help: 'Time an indexer function waited for a block before processing',
    labelNames: ['indexer'],
    buckets: [1, 10, 100, 300, 500, 1000, 3000, 5000, 10000, 30000],
});
const CACHE_HIT = new prom_client_1.Counter({
    name: 'queryapi_runner_cache_hit',
    help: 'The number of times cache was hit successfully'
});
const CACHE_MISS = new prom_client_1.Counter({
    name: 'queryapi_runner_cache_miss',
    help: 'The number of times cache was missed'
});
const UNPROCESSED_STREAM_MESSAGES = new prom_client_1.Gauge({
    name: 'queryapi_runner_unprocessed_stream_messages',
    help: 'Number of Redis Stream messages not yet processed',
    labelNames: ['indexer'],
});
const LAST_PROCESSED_BLOCK_HEIGHT = new prom_client_1.Gauge({
    name: 'queryapi_runner_last_processed_block_height',
    help: 'Previous block height processed by an indexer',
    labelNames: ['indexer'],
});
const EXECUTION_DURATION = new prom_client_1.Histogram({
    name: 'queryapi_runner_execution_duration_milliseconds',
    help: 'Time taken to execute an indexer function',
    labelNames: ['indexer'],
});
const LOGS_COUNT = new prom_client_1.Counter({
    name: 'queryapi_runner_logs_count',
    help: 'Number of messages logged',
    labelNames: ['level'],
});
exports.METRICS = {
    HEAP_TOTAL_ALLOCATION,
    HEAP_USED,
    PREFETCH_QUEUE_COUNT,
    BLOCK_WAIT_DURATION,
    CACHE_HIT,
    CACHE_MISS,
    UNPROCESSED_STREAM_MESSAGES,
    LAST_PROCESSED_BLOCK_HEIGHT,
    EXECUTION_DURATION,
    LOGS_COUNT
};
const aggregatorRegistry = new prom_client_1.AggregatorRegistry();
const workerMetrics = new Map();
const registerWorkerMetrics = (workerId, metrics) => {
    workerMetrics.set(workerId, metrics);
};
exports.registerWorkerMetrics = registerWorkerMetrics;
const deregisterWorkerMetrics = (workerId) => {
    workerMetrics.delete(workerId);
};
exports.deregisterWorkerMetrics = deregisterWorkerMetrics;
const startServer = async () => {
    const app = (0, express_1.default)();
    // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.get('/metrics', async (_req, res) => {
        res.set('Content-Type', aggregatorRegistry.contentType);
        const mainThreadMetrics = await prom_client_1.register.getMetricsAsJSON();
        const metrics = await prom_client_1.AggregatorRegistry.aggregate([...Array.from(workerMetrics.values()), mainThreadMetrics]).metrics();
        res.send(metrics);
    });
    app.listen(process.env.PORT, () => {
        logger_1.default.info(`Metrics server running on http://localhost:${process.env.PORT}`);
    });
};
exports.startServer = startServer;
