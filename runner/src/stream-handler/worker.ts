import { isMainThread, parentPort, workerData } from 'worker_threads';
import { trace, type Span, context } from '@opentelemetry/api';
import promClient from 'prom-client';
import { Block } from '@near-lake/primitives';

import { Indexer } from '../indexer';
import RedisClient from './redis-client';
import { METRICS } from '../metrics';
import LakeClient from '../lake-client';
import { WorkerMessageType, type WorkerMessage, ExecutionState } from './stream-handler';
import setUpTracerExport from '../instrumentation';
import IndexerMeta from '../indexer-meta/indexer-meta';
import IndexerConfig from '../indexer-config';
import parentLogger from '../logger';
import { wrapSpan } from '../utility';
import { type PostgresConnectionParams } from '../pg-client';
import { DmlHandler } from '../indexer/dml-handler';
import ContextBuilder from '../indexer/context-builder';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}

interface QueueMessage {
  block?: Block
  streamMessageId: string
}

type PrefetchQueue = Array<Promise<QueueMessage>>;

interface WorkerContext {
  redisClient: RedisClient
  lakeClient: LakeClient
  queue: PrefetchQueue
  indexerConfig: IndexerConfig
  databaseConnectionParams: PostgresConnectionParams
  logger: typeof parentLogger
}

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };
setUpTracerExport();
const tracer = trace.getTracer('queryapi-runner-worker');

void (async function main () {
  const indexerConfig: IndexerConfig = IndexerConfig.fromObject(workerData.indexerConfigData);
  const logger = parentLogger.child({
    service: 'StreamHandler/worker',
    accountId: indexerConfig.accountId,
    functionName: indexerConfig.functionName,
    version: indexerConfig.version
  });
  const redisClient = new RedisClient();

  const workerContext: WorkerContext = {
    redisClient,
    lakeClient: new LakeClient(),
    queue: [],
    indexerConfig,
    databaseConnectionParams: workerData.databaseConnectionParams,
    logger
  };

  await handleStream(workerContext);
})();

async function handleStream (workerContext: WorkerContext): Promise<void> {
  void blockQueueProducer(workerContext);
  void blockQueueConsumer(workerContext);
}

async function blockQueueProducer (workerContext: WorkerContext): Promise<void> {
  const HISTORICAL_BATCH_SIZE = parseInt(process.env.PREFETCH_QUEUE_LIMIT ?? '10');
  let streamMessageStartId = '0';

  while (true) {
    const preFetchCount = HISTORICAL_BATCH_SIZE - workerContext.queue.length;
    try {
      if (preFetchCount <= 0) {
        await sleep(100);
        continue;
      }
      const messages = await workerContext.redisClient.getStreamMessages(workerContext.indexerConfig.redisStreamKey, streamMessageStartId, preFetchCount);
      if (messages == null) {
        await sleep(100);
        continue;
      }

      for (const streamMessage of messages) {
        const { id, message } = streamMessage;
        workerContext.queue.push(generateQueuePromise(workerContext, Number(message.block_height), id));
      }

      streamMessageStartId = messages[messages.length - 1].id;
    } catch (err) {
      workerContext.logger.error('Error fetching stream messages', err);
      await sleep(500);
    }
  }
}

async function blockQueueConsumer (workerContext: WorkerContext): Promise<void> {
  let previousError: string = '';
  const indexerConfig: IndexerConfig = workerContext.indexerConfig;

  const dmlHandler: DmlHandler = new DmlHandler(workerContext.databaseConnectionParams, indexerConfig);
  const contextBuilder: ContextBuilder = new ContextBuilder(indexerConfig, { dmlHandler });
  const indexerMeta: IndexerMeta = new IndexerMeta(indexerConfig, workerContext.databaseConnectionParams);
  const indexer = new Indexer(indexerConfig, { contextBuilder, indexerMeta });

  let streamMessageId = '';
  let currBlockHeight = 0;

  while (true) {
    METRICS.EXECUTOR_UP.labels({ indexer: indexerConfig.fullName() }).inc();

    const metricsSpan = tracer.startSpan('Record metrics after processing block', {}, context.active());

    const unprocessedMessageCount = await workerContext.redisClient.getUnprocessedStreamMessageCount(indexerConfig.redisStreamKey);
    METRICS.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerConfig.fullName() }).set(unprocessedMessageCount);

    const memoryUsage = process.memoryUsage();
    METRICS.HEAP_TOTAL_ALLOCATION.labels({ indexer: indexerConfig.fullName() }).set(memoryUsage.heapTotal / (1024 * 1024));
    METRICS.HEAP_USED.labels({ indexer: indexerConfig.fullName() }).set(memoryUsage.heapUsed / (1024 * 1024));
    METRICS.PREFETCH_QUEUE_COUNT.labels({ indexer: indexerConfig.fullName() }).set(workerContext.queue.length);

    const metricsMessage: WorkerMessage = { type: WorkerMessageType.METRICS, data: await promClient.register.getMetricsAsJSON() };
    parentPort?.postMessage(metricsMessage);

    metricsSpan.end();

    if (workerContext.queue.length === 0) {
      parentPort?.postMessage({ type: WorkerMessageType.EXECUTION_STATE, data: { state: ExecutionState.WAITING } });
      await sleep(100);
      continue;
    }

    await tracer.startActiveSpan(`${indexerConfig.fullName()}`, async (parentSpan: Span) => {
      parentSpan.setAttribute('indexer', indexerConfig.fullName());
      parentSpan.setAttribute('account', indexerConfig.accountId);
      parentSpan.setAttribute('service.name', 'queryapi-runner');
      try {
        const blockWaitDurationTimer = METRICS.BLOCK_WAIT_DURATION.labels({ indexer: indexerConfig.fullName() }).startTimer();
        const executionDurationTimer = METRICS.EXECUTION_DURATION.labels({ indexer: indexerConfig.fullName() }).startTimer();

        const queueMessage = await wrapSpan(async () => {
          return await workerContext.queue.at(0);
        }, tracer, 'Wait for block to download');

        if (queueMessage === undefined) {
          workerContext.logger.warn('Block promise is undefined');
          return;
        }

        const block = queueMessage.block;
        if (!block?.blockHeight) {
          throw new Error(`Block ${currBlockHeight} failed to process or does not have block height`);
        }

        currBlockHeight = block.blockHeight;
        parentSpan.setAttribute('block_height', currBlockHeight);
        const blockHeightMessage: WorkerMessage = { type: WorkerMessageType.BLOCK_HEIGHT, data: currBlockHeight };
        parentPort?.postMessage(blockHeightMessage);
        streamMessageId = queueMessage.streamMessageId;

        blockWaitDurationTimer();

        await tracer.startActiveSpan(`Process Block ${currBlockHeight}`, async (executeSpan: Span) => {
          try {
            await indexer.execute(block);
          } finally {
            executeSpan.end();
          }
        });

        const postRunSpan = tracer.startSpan('Delete redis message and shift queue', {}, context.active());
        parentPort?.postMessage({ type: WorkerMessageType.EXECUTION_STATE, data: { state: ExecutionState.RUNNING } });
        await workerContext.redisClient.deleteStreamMessage(indexerConfig.redisStreamKey, streamMessageId);
        await workerContext.queue.shift();

        executionDurationTimer();

        METRICS.SUCCESSFUL_EXECUTIONS.labels({ indexer: indexerConfig.fullName() }).inc();
        METRICS.LAST_PROCESSED_BLOCK_HEIGHT.labels({ indexer: indexerConfig.fullName() }).set(currBlockHeight);
        postRunSpan.end();
      } catch (err) {
        METRICS.FAILED_EXECUTIONS.labels({ indexer: indexerConfig.fullName() }).inc();
        parentSpan.setAttribute('status', 'failed');
        parentPort?.postMessage({ type: WorkerMessageType.EXECUTION_STATE, data: { state: ExecutionState.FAILING } });
        const error = err as Error;
        if (previousError !== error.message) {
          previousError = error.message;
          workerContext.logger.warn(`Failed on block ${currBlockHeight}`, err);
        }
        const sleepSpan = tracer.startSpan('Sleep for 10 seconds after failing', {}, context.active());
        await sleep(10000);
        sleepSpan.end();
      } finally {
        parentSpan.end();
      }
    });
  }
}

async function generateQueuePromise (workerContext: WorkerContext, blockHeight: number, streamMessageId: string): Promise<QueueMessage> {
  const cachedMessage = await workerContext.redisClient.getStreamerMessage(blockHeight);
  if (cachedMessage) {
    METRICS.CACHE_HIT.inc();
    const parsedMessage = JSON.parse(cachedMessage);
    return {
      block: Block.fromStreamerMessage(parsedMessage),
      streamMessageId
    };
  } else {
    METRICS.CACHE_MISS.inc();
  }
  const block = await workerContext.lakeClient.fetchBlock(blockHeight).catch((err) => {
    workerContext.logger.error(`Error fetching block ${blockHeight}`, err);
    return undefined;
  });

  return {
    block,
    streamMessageId
  };
}
