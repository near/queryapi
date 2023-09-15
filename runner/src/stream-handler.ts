import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

import Indexer from './indexer';
import RedisClient from './redis-client';
import { METRICS } from './metrics';

interface Metric {
  type: keyof typeof METRICS
  labels: Record<string, string>
  value: number
};

export default class StreamHandler {
  private readonly worker?: Worker;

  constructor (
    streamKey: string
  ) {
    if (isMainThread) {
      this.worker = new Worker(__filename, {
        workerData: {
          streamKey,
        },
      });

      this.worker.on('message', this.handleMessage);
    } else {
      throw new Error('StreamHandler should not be instantiated in a worker thread');
    }
  }

  private handleMessage (metric: Metric): void {
    METRICS[metric.type].labels(metric.labels).set(metric.value);
  }
}

if (!isMainThread) {
  void (async function main () {
    const indexer = new Indexer('mainnet');
    const redisClient = new RedisClient();

    const { streamKey } = workerData;

    console.log('Started processing stream: ', streamKey);

    let indexerName = '';

    while (true) {
      try {
        const startTime = performance.now();
        const streamType = redisClient.getStreamType(streamKey);

        const messages = await redisClient.getNextStreamMessage(streamKey);
        const indexerConfig = await redisClient.getStreamStorage(streamKey);

        indexerName = `${indexerConfig.account_id}/${indexerConfig.function_name}`;

        if (messages == null) {
          continue;
        }

        const [{ id, message }] = messages;

        const functions = {
          [indexerName]: {
            account_id: indexerConfig.account_id,
            function_name: indexerConfig.function_name,
            code: indexerConfig.code,
            schema: indexerConfig.schema,
            provisioned: false,
          },
        };
        await indexer.runFunctions(Number(message.block_height), functions, false, {
          provision: true,
        });

        await redisClient.deleteStreamMessage(streamKey, id);

        const unprocessedMessages = await redisClient.getUnprocessedStreamMessages(streamKey);

        parentPort?.postMessage({
          type: 'UNPROCESSED_STREAM_MESSAGES',
          labels: { indexer: indexerName, type: streamType },
          value: unprocessedMessages?.length ?? 0,
        } satisfies Metric);

        parentPort?.postMessage({
          type: 'EXECUTION_DURATION',
          labels: { indexer: indexerName, type: streamType },
          value: performance.now() - startTime,
        } satisfies Metric);

        console.log(`Success: ${indexerName}`);
      } catch (err) {
        console.log(`Failed: ${indexerName}`, err);
      }
    }
  })();
}
