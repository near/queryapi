import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import Indexer from '../indexer';
import LogEntry from '../indexer-meta/log-entry';
import logger from '../logger';

import type IndexerConfig from '../indexer-config';
import { PostgresConnectionParams } from '../pg-client';

export enum WorkerMessageType {
  METRICS,
  BLOCK_HEIGHT,
  STATUS,
  DATABASE_CONNECTION_PARAMS,
}

export interface WorkerMessage {
  type: WorkerMessageType
  data: any
}

export enum ExecutionState {
  RUNNING = 'RUNNING',
  FAILING = 'FAILING',
  WAITING = 'WAITING',
  STOPPED = 'STOPPED',
  STALLED = 'STALLED',
}

interface ExecutorContext {
  executionState: ExecutionState
  block_height: number
}

export default class StreamHandler {
  private readonly logger: typeof logger;
  private readonly worker: Worker;
  public readonly executorContext: ExecutorContext;
  private database_connection_parameters: PostgresConnectionParams | undefined;

  constructor(
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
        executionState: ExecutionState.RUNNING,
        block_height: indexerConfig.version,
      };

      this.worker.on('message', this.handleMessage.bind(this));
      this.worker.on('error', this.handleError.bind(this));
    } else {
      throw new Error('StreamHandler should not be instantiated in a worker thread');
    }
  }

  async stop(): Promise<void> {
    deregisterWorkerMetrics(this.worker.threadId);

    this.executorContext.executionState = ExecutionState.STOPPED;

    await this.worker.terminate();
  }

  private handleError(error: Error): void {
    this.logger.error('Terminating thread', error);
    this.executorContext.executionState = ExecutionState.STALLED;

    if (this.database_connection_parameters) {
      const indexerMeta = new IndexerMeta(this.indexerConfig, this.database_connection_parameters);
      indexerMeta.setStatus(IndexerStatus.STOPPED).catch((e) => {
        this.logger.error('Failed to set stopped status for indexer', e);
      });
      const errorContent = error instanceof Error ? error.toString() : JSON.stringify(error);
      const streamErrorLogEntry = LogEntry.systemError(`Encountered error processing stream: ${this.indexerConfig.redisStreamKey}, terminating thread\n${errorContent}`, this.executorContext.block_height);

      indexerMeta.writeLogs([streamErrorLogEntry])
        .catch((e) => {
          this.logger.error('Failed to write failure log for stream', e);
        });
    } else {
      this.logger.error('Worker crashed but was unable to write crash log to Indexer logs due to failure to acquire DB Connection Parameters');
    }

    this.worker.terminate().catch(() => {
      this.logger.error('Failed to terminate thread for stream');
    });
  }

  private handleMessage(message: WorkerMessage): void {
    switch (message.type) {
      case WorkerMessageType.EXECUTION_STATE:
        this.executorContext.executionState = message.data.state;
        break;
      case WorkerMessageType.BLOCK_HEIGHT:
        this.executorContext.block_height = message.data;
        break;
      case WorkerMessageType.DATABASE_CONNECTION_PARAMS:
        this.database_connection_parameters = message.data;
      case WorkerMessageType.METRICS:
        registerWorkerMetrics(this.worker.threadId, message.data);
        break;
    }
  }
}
