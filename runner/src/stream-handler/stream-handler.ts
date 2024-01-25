import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics } from '../metrics';

export enum Status {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
}
export interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
  version: number
}

interface ExecutorContext {
  status: Status
}

export default class StreamHandler {
  private readonly worker: Worker;
  public readonly executorContext: ExecutorContext;

  constructor (
    public readonly streamKey: string,
    public readonly indexerConfig: IndexerConfig | undefined = undefined
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
      };

      this.worker.on('message', this.handleMessage.bind(this));
      this.worker.on('error', this.handleError.bind(this));
    } else {
      throw new Error('StreamHandler should not be instantiated in a worker thread');
    }
  }

  async stop (): Promise<void> {
    await this.worker.terminate();
  }

  private handleError (error: Error): void {
    console.log(`Encountered error processing stream: ${this.streamKey}, terminating thread`, error);
    if (this.indexerConfig !== undefined) {
      this.executorContext.status = Status.STOPPED;
    }
    this.worker.terminate().catch(() => {
      console.log(`Failed to terminate thread for stream: ${this.streamKey}`);
    });
  }

  private handleMessage (message: string): void {
    registerWorkerMetrics(this.worker.threadId, message);
  }
}
