import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics, deregisterWorkerMetrics } from '../metrics';
import Indexer from '../indexer';

export enum Status {
  RUNNING = 'RUNNING',
  FAILING = 'FAILING',
  STOPPED = 'STOPPED',
}
export interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
  version: number
}

export enum WorkerMessageType {
  METRICS = 'METRICS',
  BLOCK_HEIGHT = 'BLOCK_HEIGHT',
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
    public readonly indexerConfig: IndexerConfig
  ) {
    if (isMainThread) {
      this.worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: {
          streamKey,
          indexerConfig,
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
    console.log(`Encountered error processing stream: ${this.streamKey}, terminating thread`, error);
    this.executorContext.status = Status.STOPPED;
    const indexer = new Indexer();
    const functionName = `${this.indexerConfig.account_id}/${this.indexerConfig.function_name}`;
    indexer.setStatus(functionName, 0, Status.STOPPED).catch((e) => {
      console.log(`Failed to set status STOPPED for stream: ${this.streamKey}`, e);
    });
    indexer.writeLog(functionName, this.executorContext.block_height, `Encountered error processing stream: ${this.streamKey}, terminating thread\n${error.toString()}`).catch((e) => {
      console.log(`Failed to write log for stream: ${this.streamKey}`, e);
    });
    this.worker.terminate().catch(() => {
      console.log(`Failed to terminate thread for stream: ${this.streamKey}`);
    });
  }

  private handleMessage (message: WorkerMessage): void {
    switch (message.type) {
      case WorkerMessageType.BLOCK_HEIGHT:
        this.executorContext.block_height = message.data;
        break;
      case WorkerMessageType.METRICS:
        registerWorkerMetrics(this.worker.threadId, message.data);
        break;
    }
  }
}
