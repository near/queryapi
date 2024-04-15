import format from 'pg-format';
import { wrapError } from '../utility';
import PgClient, { type PostgresConnectionParams } from '../pg-client';
import { trace } from '@opentelemetry/api';
import type LogEntry from './log-entry';
import { LogLevel } from './log-entry';

export enum IndexerStatus {
  PROVISIONING = 'PROVISIONING',
  RUNNING = 'RUNNING',
  FAILING = 'FAILING',
  STOPPED = 'STOPPED',
}

const METADATA_TABLE_UPSERT = 'INSERT INTO %I.__metadata (attribute, value) VALUES %L ON CONFLICT (attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *';
const STATUS_ATTRIBUTE = 'STATUS';
const LAST_PROCESSED_BLOCK_HEIGHT_ATTRIBUTE = 'LAST_PROCESSED_BLOCK_HEIGHT';

export default class IndexerMeta {
  tracer = trace.getTracer('queryapi-runner-indexer-logger');

  private readonly pgClient: PgClient;
  private readonly schemaName: string;
  private readonly logInsertQueryTemplate: string = 'INSERT INTO %I.__logs (block_height, date, timestamp, type, level, message) VALUES %L';
  private readonly loggingLevel: number;

  constructor (
    functionName: string,
    loggingLevel: number,
    databaseConnectionParameters: PostgresConnectionParams,
    pgClientInstance: PgClient | undefined = undefined
  ) {
    const pgClient = pgClientInstance ?? new PgClient(databaseConnectionParameters);

    this.pgClient = pgClient;
    this.schemaName = functionName.replace(/[^a-zA-Z0-9]/g, '_');
    this.loggingLevel = loggingLevel;
  }

  private shouldLog (logLevel: LogLevel): boolean {
    return logLevel >= this.loggingLevel;
  }

  async writeLogs (
    logEntries: LogEntry[],
  ): Promise<void> {
    const entriesArray = logEntries.filter(entry => this.shouldLog(entry.level));
    if (entriesArray.length === 0) return;

    const spanMessage = `write log for ${entriesArray.length === 1 ? 'single entry' : `batch of ${entriesArray.length}`} through postgres `;
    const writeLogSpan = this.tracer.startSpan(spanMessage);
    await wrapError(async () => {
      const values = entriesArray.map(entry => [
        entry.blockHeight,
        entry.timestamp,
        entry.timestamp,
        entry.type,
        LogLevel[entry.level],
        entry.message
      ]);
      const query = format(this.logInsertQueryTemplate, this.schemaName, values);
      await this.pgClient.query(query);
    }, `Failed to insert ${entriesArray.length > 1 ? 'logs' : 'log'} into the ${this.schemaName}.__logs table`)
      .finally(() => {
        writeLogSpan.end();
      });
  }

  async setStatus (status: IndexerStatus): Promise<void> {
    const setStatusSpan = this.tracer.startSpan(`set status of indexer to ${status} through postgres`);
    const values = [[STATUS_ATTRIBUTE, status]];
    const query = format(METADATA_TABLE_UPSERT, this.schemaName, values);

    try {
      await wrapError(async () => await this.pgClient.query(query), `Failed to update status for ${this.schemaName}`);
    } finally {
      setStatusSpan.end();
    }
  }

  async updateBlockheight (blockHeight: number): Promise<void> {
    const setLastProcessedBlockSpan = this.tracer.startSpan(`set last processed block to ${blockHeight} through postgres`);
    const values = [[LAST_PROCESSED_BLOCK_HEIGHT_ATTRIBUTE, blockHeight.toString()]];
    const query = format(METADATA_TABLE_UPSERT, this.schemaName, values);

    try {
      await wrapError(async () => await this.pgClient.query(query), `Failed to update last processed block height for ${this.schemaName}`);
    } finally {
      setLastProcessedBlockSpan.end();
    }
  }
}
