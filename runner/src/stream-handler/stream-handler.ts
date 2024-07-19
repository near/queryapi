import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import LogEntry from '../indexer-meta/log-entry';
import logger from '../logger';

import type IndexerConfig from '../indexer-config';
import IndexerMeta, { IndexerStatus } from '../indexer-meta';
import assert from 'assert';
import Provisioner from '../provisioner';
import { type PostgresConnectionParams } from '../pg-client';

export enum WorkerMessageType {
  METRICS,
  BLOCK_HEIGHT,
  EXECUTION_STATE,
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
  private worker: Worker | undefined;
  public readonly executorContext: ExecutorContext;
  private indexerMeta: IndexerMeta | undefined;

  constructor (
    public readonly indexerConfig: IndexerConfig,
  ) {
    this.logger = logger.child({ accountId: indexerConfig.accountId, functionName: indexerConfig.functionName, service: this.constructor.name });

    this.executorContext = {
      executionState: ExecutionState.WAITING,
      block_height: indexerConfig.version,
    };
  }

  async start (): Promise<void> {
    if (isMainThread) {
      try {
        const provisioner = new Provisioner();
        const databaseConnectionParams: PostgresConnectionParams = await provisioner.getPgBouncerConnectionParameters(this.indexerConfig.hasuraRoleName());

        this.indexerMeta = new IndexerMeta(this.indexerConfig, databaseConnectionParams);
        this.worker = new Worker(path.join(__dirname, 'worker.js'), {
          workerData: {
            indexerConfigData: this.indexerConfig.toObject(),
            databaseConnectionParams,
          },
        });

        this.worker.on('message', this.handleMessage.bind(this));
        this.worker.on('error', this.handleError.bind(this));

        this.executorContext.executionState = ExecutionState.RUNNING;
      } catch (error: any) {
        const errorContent = error instanceof Error ? error.toString() : JSON.stringify(error);
        this.logger.error('Terminating thread', error);
        this.executorContext.executionState = ExecutionState.STALLED;
        throw new Error(`Failed to start Indexer: ${errorContent}`);
      }
    } else {
      throw new Error('StreamHandler should not be instantiated in a worker thread');
    }
  }

  async stop (): Promise<void> {
    if (this.worker) {
      deregisterWorkerMetrics(this.worker.threadId);
      await this.worker.terminate();
    }
    this.executorContext.executionState = ExecutionState.STOPPED;
  }

  private handleError (error: Error): void {
    this.logger.error('Terminating thread', error);
    this.executorContext.executionState = ExecutionState.STALLED;

    if (this.indexerMeta) {
      this.indexerMeta.setStatus(IndexerStatus.STOPPED).catch((e: Error) => {
        this.logger.error('Failed to set stopped status for indexer', e);
      });
      const errorContent = error instanceof Error ? error.toString() : JSON.stringify(error);
      const streamErrorLogEntry = LogEntry.systemError(`Encountered error processing stream: ${this.indexerConfig.redisStreamKey}, terminating thread\n${errorContent}`, this.executorContext.block_height);
      this.indexerMeta.writeLogs([streamErrorLogEntry])
        .catch((e) => {
          this.logger.error('Failed to write failure log for stream', e);
        });
    }

    if (this.worker) {
      this.worker.terminate().catch(() => {
        this.logger.error('Failed to terminate thread for stream');
      });
    }
  }

  private handleMessage (message: WorkerMessage): void {
    switch (message.type) {
      case WorkerMessageType.EXECUTION_STATE:
        this.executorContext.executionState = message.data.state;
        break;
      case WorkerMessageType.BLOCK_HEIGHT:
        this.executorContext.block_height = message.data;
        break;
      case WorkerMessageType.METRICS:
        assert(this.worker, 'Worker is not initialized');
        registerWorkerMetrics(this.worker.threadId, message.data);
        break;
    }
  }
}
