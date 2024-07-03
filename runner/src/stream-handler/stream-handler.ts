import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import Indexer from '../indexer';
import { IndexerStatus } from '../indexer-meta/indexer-meta';
import LogEntry from '../indexer-meta/log-entry';
import logger from '../logger';

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
  private readonly logger: typeof logger;
  private worker?: Worker;
  public executorContext: ExecutorContext = {
    status: IndexerStatus.STOPPED,
    block_height: 0,
  };

  constructor (
    public readonly indexerConfig: IndexerConfig,
  ) {
    if (!isMainThread) {
      throw new Error('StreamHandler must be instantiated in the main thread');
    }

    this.logger = logger.child({ accountId: indexerConfig.accountId, functionName: indexerConfig.functionName, service: this.constructor.name });
  }

  start (): void {
    this.worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: {
        indexerConfigData: this.indexerConfig.toObject(),
      },
    });
    this.executorContext = {
      status: IndexerStatus.RUNNING,
      block_height: this.indexerConfig.version,
    };

    this.worker.on('message', this.handleMessage.bind(this));
    this.worker.on('error', this.handleError.bind(this));
  }

  async stop (): Promise<void> {
    if (!this.worker) {
      return;
    }

    deregisterWorkerMetrics(this.worker.threadId);

    await this.worker.terminate();
  }

  private handleError (error: Error): void {
    this.logger.error('Encountered uncaught error, restarting worker thread', error);

    this.executorContext.status = IndexerStatus.STOPPED;

    const indexer = new Indexer(this.indexerConfig);
    indexer.setStoppedStatus().catch((e) => {
      this.logger.error('Failed to set stopped status for indexer', e);
    });
    const errorContent = error instanceof Error ? error.toString() : JSON.stringify(error);

    indexer
      .writeCrashedWorkerLog(
        LogEntry.systemError(`Encountered uncaught error: ${this.indexerConfig.redisStreamKey}, restarting worker\n${errorContent}`, this.executorContext.block_height)
      )
      .catch((e) => {
        this.logger.error('Failed to write failure log for stream', e);
      });

    this.start();
  }

  private handleMessage (message: WorkerMessage): void {
    switch (message.type) {
      case WorkerMessageType.STATUS:
        this.executorContext.status = message.data.status;
        break;
      case WorkerMessageType.BLOCK_HEIGHT:
        this.executorContext.block_height = message.data;
        break;
      case WorkerMessageType.METRICS:
        if (this.worker) {
          registerWorkerMetrics(this.worker.threadId, message.data);
        }
        break;
    }
  }
}
