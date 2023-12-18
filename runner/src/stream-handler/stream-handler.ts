import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { registerWorkerMetrics } from '../metrics';

export interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
}

export default class StreamHandler {
  private readonly worker: Worker;
  readonly indexerName: string;

  constructor (
    public readonly streamKey: string,
    public readonly indexerConfig: IndexerConfig | undefined = undefined
  ) {
    this.indexerName = (indexerConfig?.account_id ?? 'undefined_account') + '/' + (indexerConfig?.function_name ?? 'undefined_function');
    if (isMainThread) {
      this.worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: {
          streamKey,
          indexerConfig,
        },
      });

      this.worker.on('message', this.handleMessage.bind(this));
      this.worker.on('error', this.handleError.bind(this));
    } else {
      throw new Error('StreamHandler should not be instantiated in a worker thread');
    }
  }

  async stop (): Promise<void> {
    await this.worker.terminate();
  }

  updateIndexerConfig (indexerConfig: IndexerConfig): void {
    this.worker.postMessage({
      indexerConfig,
    });
  }

  private handleError (error: Error): void {
    console.log(`Encountered error processing stream: ${this.streamKey}, terminating thread`, error);
    this.worker.terminate().catch(() => {
      console.log(`Failed to terminate thread for stream: ${this.streamKey}`);
    });
  }

  private handleMessage (message: string): void {
    registerWorkerMetrics(this.worker.threadId, message);
  }
}
