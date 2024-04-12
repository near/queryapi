import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import Indexer from '../indexer';
import { IndexerStatus } from '../indexer-meta/indexer-meta';
import LogEntry, { LogLevel } from '../indexer-meta/log-entry';

import type IndexerConfig from '../indexer-config';

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
          indexerConfigData: indexerConfig.toObject(),
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
    console.error(`Encountered error processing stream: ${this.indexerConfig.fullName()}, terminating thread`, error);
    this.executorContext.status = IndexerStatus.STOPPED;

    const indexer = new Indexer(this.indexerConfig);
    indexer.setStatus(0, IndexerStatus.STOPPED).catch((e) => {
      console.error(`Failed to set status STOPPED for stream: ${this.indexerConfig.redisStreamKey}`, e);
    });
    indexer.setStoppedStatus().catch((e) => {
      console.error(`Failed to set stopped status for stream in Metadata table: ${this.indexerConfig.redisStreamKey}`, e);
    });

    const streamErrorLogEntry = LogEntry.systemError(`Encountered error processing stream: ${this.indexerConfig.redisStreamKey}, terminating thread\n${error.toString()}`, this.executorContext.block_height);

    Promise.all([
      indexer.writeLogOld(LogLevel.ERROR, this.executorContext.block_height, `Encountered error processing stream: ${this.indexerConfig.fullName()}, terminating thread\n${error.toString()}`),
      indexer.callWriteLog(streamErrorLogEntry),
    ]).catch((e) => {
      console.error(`Failed to write failure log for stream: ${this.indexerConfig.redisStreamKey}`, e);
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
