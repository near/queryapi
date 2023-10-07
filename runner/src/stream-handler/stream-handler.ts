import path from 'path';
import { Worker, isMainThread } from 'worker_threads';

import { type Message } from './types';
import { METRICS } from '../metrics';
import { type Counter, Gauge } from 'prom-client';

export default class StreamHandler {
  private readonly worker?: Worker;

  constructor (
    public readonly streamKey: string
  ) {
    if (isMainThread) {
      this.worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: {
          streamKey,
        },
      });

      this.worker.on('message', this.handleMessage);
      this.worker.on('error', this.handleError);
    } else {
      throw new Error('StreamHandler should not be instantiated in a worker thread');
    }
  }

  private handleError (error: Error): void {
    console.log(`Encountered error processing stream: ${this.streamKey}, terminating thread`, error);
    this.worker?.terminate().catch(() => {
      console.log(`Failed to terminate thread for stream: ${this.streamKey}`);
    });
  }

  private handleMessage (message: Message): void {
    if (METRICS[message.type] instanceof Gauge) {
      (METRICS[message.type] as Gauge).labels(message.labels).set(message.value);
    } else {
      (METRICS[message.type] as Counter).labels(message.labels).inc(message.value);
    }
  }
}
