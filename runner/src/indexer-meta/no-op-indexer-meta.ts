import { type LocalIndexerConfig } from '../indexer-config/indexer-config';
import { type IndexerStatus, type IndexerMetaInterface } from './indexer-meta';
import type LogEntry from './log-entry';
import { LogLevel } from './log-entry';

export default class NoOpIndexerMeta implements IndexerMetaInterface {
  constructor (
    private readonly indexerConfig: LocalIndexerConfig,
  ) {}

  private shouldLog (logLevel: LogLevel): boolean {
    return logLevel >= this.indexerConfig.logLevel;
  }

  async writeLogs (logEntries: LogEntry[]): Promise<void> {
    const entriesArray = logEntries.filter(entry => this.shouldLog(entry.level));
    if (entriesArray.length === 0) {
      return;
    };
    entriesArray.forEach(entry => {
      console.log(`[${LogLevel[entry.level]}] [${entry.timestamp.toString()}] ${entry.message}`);
    });
  }

  async setStatus (status: IndexerStatus): Promise<void> {
    console.log(`Setting status to ${status}`);
  }

  async updateBlockHeight (blockHeight: number): Promise<void> {
    console.log(`Setting last processed block height to ${blockHeight}`);
  }
}
