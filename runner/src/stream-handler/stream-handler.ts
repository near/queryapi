import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import Indexer from '../indexer';
import { IndexerStatus } from '../indexer-meta/indexer-meta';
import { /* LogType, */ LogLevel } from '../indexer-meta/log-entry';

export interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
  version: number
}

export enum Status {
  RUNNING = 'RUNNING',
  FAILING = 'FAILING',
  STOPPED = 'STOPPED',
}

export enum WorkerMessageType {
  METRICS = 'METRICS',
  BLOCK_HEIGHT = 'BLOCK_HEIGHT',
  STATUS = 'STATUS',
}

export interface WorkerMessage {
  type: WorkerMessageType
  data: any
}

interface ExecutorContext {
  status: IndexerStatus
  block_height: number
}

export default class StreamHandler {
  private readonly worker: Worker;
  public readonly executorContext: ExecutorContext;

  constructor (
    public readonly indexerConfig: IndexerConfig,
  ) {
    if (isMainThread) {
      this.worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: {
          indexerConfig,
        },
      });
      this.executorContext = {
        status: IndexerStatus.RUNNING,
        block_height: indexerConfig.version,
      };

      this.worker.on('message', this.handleMessage.bind(this));
      this.worker.on('error', this.handleError.bind(this));
    } else {
      throw new Error('StreamHandler should not be instantiated in a worker thread');
    }
  }

  async stop (): Promise<void> {
    deregisterWorkerMetrics(this.worker.threadId);

    await this.worker.terminate();
  }

  private handleError (error: Error): void {
    console.error(`Encountered error processing stream: ${this.indexerConfig.redisStreamKey}, terminating thread`, error);
    this.executorContext.status = IndexerStatus.STOPPED;
    const indexer = new Indexer(this.indexerConfig);

    indexer.setStatus(0, IndexerStatus.STOPPED).catch((e) => {
      console.error(`Failed to set status STOPPED for stream: ${this.indexerConfig.redisStreamKey}`, e);
    });

    Promise.all([
      indexer.writeLog(
        LogLevel.ERROR,
        this.executorContext.block_height,
        `Encountered error processing stream: ${this.indexerConfig.redisStreamKey}, terminating thread\n${error.toString()}`
      ),
      // indexer.callWriteLog({
      //   blockHeight: this.executorContext.block_height,
      //   logTimestamp: new Date(),
      //   logType: LogType.SYSTEM,
      //   logLevel: LogLevel.ERROR,
      //   message: `Encountered error processing stream: ${this.streamKey}, terminating thread\n${error.toString()}`
      // })
    ]).catch((e) => {
      console.error(`Failed to write log for stream: ${this.indexerConfig.redisStreamKey}`, e);
    });

    this.worker.terminate().catch(() => {
      console.error(`Failed to terminate thread for stream: ${this.indexerConfig.redisStreamKey}`);
    });
  }

  private handleMessage (message: WorkerMessage): void {
    switch (message.type) {
      case WorkerMessageType.STATUS:
        this.executorContext.status = message.data;
        break;
      case WorkerMessageType.BLOCK_HEIGHT:
        this.executorContext.block_height = message.data;
        break;
      case WorkerMessageType.METRICS:
        registerWorkerMetrics(this.worker.threadId, message.data);
        break;
    }
  }
}
