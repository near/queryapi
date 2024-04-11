import { isMainThread, parentPort, workerData } from 'worker_threads';
import promClient from 'prom-client';
import Indexer from '../indexer';
import RedisClient from '../redis-client';
import { METRICS } from '../metrics';
import type { Block } from '@near-lake/primitives';
import LakeClient from '../lake-client';
import { WorkerMessageType, type WorkerMessage } from './stream-handler';
import { trace, type Span, context } from '@opentelemetry/api';
import setUpTracerExport from '../instrumentation';
import { IndexerStatus } from '../indexer-meta/indexer-meta';
import IndexerConfig from '../indexer-config';

if (isMainThread) {
  throw new Error('Worker should not be run on main thread');
}
interface QueueMessage {
  block: Block
  streamMessageId: string
}
type PrefetchQueue = Array<Promise<QueueMessage>>;

interface WorkerContext {
  redisClient: RedisClient
  lakeClient: LakeClient
  queue: PrefetchQueue
  indexerConfig: IndexerConfig
}

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };
setUpTracerExport();
const tracer = trace.getTracer('queryapi-runner-worker');

void (async function main () {
  const indexerConfig: IndexerConfig = IndexerConfig.fromObject(workerData.indexerConfigData);
  const redisClient = new RedisClient();
  const workerContext: WorkerContext = {
    redisClient,
    lakeClient: new LakeClient(),
    queue: [],
    indexerConfig
  };

  console.log('Started processing stream: ', workerContext.indexerConfig.fullName(), workerContext.indexerConfig.version);

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
      console.error('Error fetching stream messages', err);
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
        const startTime = performance.now();
        const blockStartTime = performance.now();

        const queueMessage = await tracer.startActiveSpan('Wait for block to download', async (blockWaitSpan: Span) => {
          try {
            return await workerContext.queue.at(0);
          } finally {
            blockWaitSpan.end();
          }
        });
        if (queueMessage === undefined) {
          console.warn('Block promise is undefined');
          return;
        }

        const block = queueMessage.block;
        if (block === undefined || block.blockHeight == null) {
          throw new Error(`Block ${currBlockHeight} failed to process or does not have block height`);
        }

        currBlockHeight = block.blockHeight;
        parentSpan.setAttribute('block_height', currBlockHeight);
        const blockHeightMessage: WorkerMessage = { type: WorkerMessageType.BLOCK_HEIGHT, data: currBlockHeight };
        parentPort?.postMessage(blockHeightMessage);
        streamMessageId = queueMessage.streamMessageId;

        METRICS.BLOCK_WAIT_DURATION.labels({ indexer: indexerConfig.fullName() }).observe(performance.now() - blockStartTime);

        await tracer.startActiveSpan(`Process Block ${currBlockHeight}`, async (executeSpan: Span) => {
          try {
            await indexer.execute(block);
          } finally {
            executeSpan.end();
          }
        });

        const postRunSpan = tracer.startSpan('Delete redis message and shift queue', {}, context.active());
        parentPort?.postMessage({ type: WorkerMessageType.STATUS, data: { status: IndexerStatus.RUNNING } });
        await workerContext.redisClient.deleteStreamMessage(indexerConfig.redisStreamKey, streamMessageId);
        await workerContext.queue.shift();

        METRICS.EXECUTION_DURATION.labels({ indexer: indexerConfig.fullName() }).observe(performance.now() - startTime);
        METRICS.LAST_PROCESSED_BLOCK_HEIGHT.labels({ indexer: indexerConfig.fullName() }).set(currBlockHeight);
        postRunSpan.end();
      } catch (err) {
        parentSpan.setAttribute('status', 'failed');
        parentPort?.postMessage({ type: WorkerMessageType.STATUS, data: { status: IndexerStatus.FAILING } });
        const error = err as Error;
        if (previousError !== error.message) {
          previousError = error.message;
          console.log(`Failed: ${indexerConfig.fullName()} on block ${currBlockHeight}`, err);
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

        const metricsMessage: WorkerMessage = { type: WorkerMessageType.METRICS, data: await promClient.register.getMetricsAsJSON() };
        parentPort?.postMessage(metricsMessage);

        metricsSpan.end();
        parentSpan.end();
      }
    });
  }
}

async function generateQueuePromise (workerContext: WorkerContext, blockHeight: number, streamMessageId: string): Promise<QueueMessage> {
  const block = await workerContext.lakeClient.fetchBlock(blockHeight);
  return {
    block,
    streamMessageId
  };
}
