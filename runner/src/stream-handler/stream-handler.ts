import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import Indexer from '../indexer';
import { LogType } from '../indexer-logger/indexer-logger';

export enum Status {
  RUNNING = 'RUNNING',
  FAILING = 'FAILING',
  STOPPED = 'STOPPED',
}

export enum LogLevel {
  DEBUG = 2,
  INFO = 5,
  WARN = 6,
  ERROR = 8,
}

export interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
  version: number
}

export interface IndexerBehavior {
  log_level: LogLevel
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
  status: Status
  block_height: number
}

export default class StreamHandler {
  private readonly worker: Worker;
  public readonly executorContext: ExecutorContext;

  constructor (
    public readonly streamKey: string,
    public readonly indexerConfig: IndexerConfig,
    public readonly indexerBehavior: IndexerBehavior
  ) {
    if (isMainThread) {
      this.worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: {
          streamKey,
          indexerConfig,
          indexerBehavior,
        },
      });
      this.executorContext = {
        status: Status.RUNNING,
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
    console.error(`Encountered error processing stream: ${this.streamKey}, terminating thread`, error);
    this.executorContext.status = Status.STOPPED;
    const indexer = new Indexer(this.indexerBehavior);
    const functionName = `${this.indexerConfig.account_id}/${this.indexerConfig.function_name}`;

    indexer.setStatus(functionName, 0, Status.STOPPED).catch((e) => {
      console.error(`Failed to set status STOPPED for stream: ${this.streamKey}`, e);
    });

    indexer.writeLog({
      blockHeight: this.executorContext.block_height,
      logTimestamp: new Date(),
      logType: LogType.SYSTEM,
      logLevel: LogLevel.ERROR,
      message: `Encountered error processing stream: ${this.streamKey}, terminating thread\n${error.toString()}`
    }, [], functionName).catch((e) => {
      console.error(`Failed to write log for stream: ${this.streamKey}`, e);
    });

    this.worker.terminate().catch(() => {
      console.error(`Failed to terminate thread for stream: ${this.streamKey}`);
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
