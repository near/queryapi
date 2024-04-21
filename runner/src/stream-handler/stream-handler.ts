import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import Indexer from '../indexer';
import { IndexerStatus } from '../indexer-meta/indexer-meta';
import LogEntry, { LogLevel } from '../indexer-meta/log-entry';
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
  private readonly worker: Worker;
  public readonly executorContext: ExecutorContext;

  constructor (
    public readonly indexerConfig: IndexerConfig,
  ) {
    if (isMainThread) {
      this.logger = logger.child({ accountId: indexerConfig.accountId, functionName: indexerConfig.functionName, service: this.constructor.name });

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
    this.logger.error('Terminating thread', error);
    this.executorContext.status = IndexerStatus.STOPPED;

    const indexer = new Indexer(this.indexerConfig);
    indexer.setStatus(0, IndexerStatus.STOPPED).catch((e) => {
      this.logger.error('Failed to set status STOPPED for stream', e);
    });
    indexer.setStoppedStatus().catch((e) => {
      this.logger.error('Failed to set stopped status for stream in Metadata table', e);
    });

    const streamErrorLogEntry = LogEntry.systemError(`Encountered error processing stream: ${this.indexerConfig.redisStreamKey}, terminating thread\n${error.toString()}`, this.executorContext.block_height);

    Promise.all([
      indexer.writeLogOld(LogLevel.ERROR, this.executorContext.block_height, `Encountered error processing stream: ${this.indexerConfig.fullName()}, terminating thread\n${error.toString()}`),
      indexer.callWriteLog(streamErrorLogEntry),
    ]).catch((e) => {
      this.logger.error('Failed to write failure log for stream', e);
    });

    this.worker.terminate().catch(() => {
      this.logger.error('Failed to terminate thread for stream');
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
