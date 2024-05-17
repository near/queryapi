import 'dotenv/config';

import { trace, type Span, context } from '@opentelemetry/api';
// import promClient from 'prom-client';
import type { Block } from '@near-lake/primitives';

import Indexer from './indexer';
import RedisClient from './redis-client';
import { METRICS } from './metrics';
import LakeClient from './lake-client';
// import { WorkerMessageType, type WorkerMessage } from './stream-handler/stream-handler';
import setUpTracerExport from './instrumentation';
import IndexerConfig from './indexer-config';
import parentLogger from './logger';
import { wrapSpan } from './utility';

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
  logger: typeof parentLogger
}

const indexerConfigData = {
  redisStreamKey: 'morgs.near/firecracker:block_stream',
  accountId: 'morgs.near',
  functionName: 'firecracker',
  version: 1,
  code: 'console.log("Hello World")',
  schema: `
    CREATE TABLE
      "actions_index" (
        "block_date" TEXT NOT NULL,
        "receiver_id" TEXT NOT NULL,
        "first_block_height" NUMERIC(20) NOT NULL,
        "bitmap" TEXT NOT NULL,
        "last_elias_gamma_start_bit" NUMERIC(10) NOT NULL,
        "max_index" NUMERIC(10) NOT NULL,
        PRIMARY KEY ("block_date", "receiver_id")
      );
  `,
  logLevel: 5
};

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };
setUpTracerExport();
const tracer = trace.getTracer('queryapi-runner-worker');

void (async function main () {
  const indexerConfig: IndexerConfig = IndexerConfig.fromObject(indexerConfigData);
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
  const indexer = new Indexer(indexerConfig);
  let streamMessageId = '';
  let currBlockHeight = 0;

  while (true) {
    if (workerContext.queue.length === 0) {
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
        streamMessageId = queueMessage.streamMessageId;

        blockWaitDurationTimer();

        await tracer.startActiveSpan(`Process Block ${currBlockHeight}`, async (executeSpan: Span) => {
          try {
            await indexer.execute(block);
          } finally {
            executeSpan.end();
          }
        });

        workerContext.logger.debug(`Finished exucting block ${block.blockHeight}`);

        const postRunSpan = tracer.startSpan('Delete redis message and shift queue', {}, context.active());
        await workerContext.redisClient.deleteStreamMessage(indexerConfig.redisStreamKey, streamMessageId);
        await workerContext.queue.shift();

        executionDurationTimer();

        METRICS.LAST_PROCESSED_BLOCK_HEIGHT.labels({ indexer: indexerConfig.fullName() }).set(currBlockHeight);
        postRunSpan.end();
      } catch (err) {
        parentSpan.setAttribute('status', 'failed');
        const error = err as Error;
        if (previousError !== error.message) {
          previousError = error.message;
          workerContext.logger.error(`Failed on block ${currBlockHeight}`, err);
        }
        const sleepSpan = tracer.startSpan('Sleep for 10 seconds after failing', {}, context.active());
        await sleep(10000);
        sleepSpan.end();
      } finally {
        const metricsSpan = tracer.startSpan('Record metrics after processing block', {}, context.active());

        const unprocessedMessageCount = await workerContext.redisClient.getUnprocessedStreamMessageCount(indexerConfig.redisStreamKey);
        METRICS.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerConfig.fullName() }).set(unprocessedMessageCount);

        const memoryUsage = process.memoryUsage();
        METRICS.HEAP_TOTAL_ALLOCATION.labels({ indexer: indexerConfig.fullName() }).set(memoryUsage.heapTotal / (1024 * 1024));
        METRICS.HEAP_USED.labels({ indexer: indexerConfig.fullName() }).set(memoryUsage.heapUsed / (1024 * 1024));
        METRICS.PREFETCH_QUEUE_COUNT.labels({ indexer: indexerConfig.fullName() }).set(workerContext.queue.length);

        // const metricsMessage: WorkerMessage = { type: WorkerMessageType.METRICS, data: await promClient.register.getMetricsAsJSON() };

        metricsSpan.end();
        parentSpan.end();
      }
    });
  }
}

async function generateQueuePromise (workerContext: WorkerContext, blockHeight: number, streamMessageId: string): Promise<QueueMessage> {
  const block = await workerContext.lakeClient.fetchBlock(blockHeight).catch((err) => {
    workerContext.logger.error(`Error fetching block ${blockHeight}`, err);
    return undefined;
  });

  workerContext.logger.debug(`Downloaded block ${blockHeight}`);

  return {
    block,
    streamMessageId
  };
}
