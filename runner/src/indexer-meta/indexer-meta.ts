import format from 'pg-format';
import { wrapError } from '../utility';
import PgClient, { type PostgresConnectionParams } from '../pg-client';
import { trace } from '@opentelemetry/api';
import type LogEntry from './log-entry';
import { LogLevel } from './log-entry';
import type IndexerConfig from '../indexer-config';

export enum IndexerStatus {
  PROVISIONING = 'PROVISIONING',
  RUNNING = 'RUNNING',
  FAILING = 'FAILING',
  STOPPED = 'STOPPED',
}

export const METADATA_TABLE_UPSERT = 'INSERT INTO %I.sys_metadata (attribute, value) VALUES %L ON CONFLICT (attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *';
export enum MetadataFields {
  STATUS = 'STATUS',
  LAST_PROCESSED_BLOCK_HEIGHT = 'LAST_PROCESSED_BLOCK_HEIGHT'
}

export default class IndexerMeta {
  tracer = trace.getTracer('queryapi-runner-indexer-logger');

  private readonly pgClient: PgClient;
  private readonly indexerConfig: IndexerConfig;
  private readonly logInsertQueryTemplate: string = 'INSERT INTO %I.sys_logs (block_height, date, timestamp, type, level, message) VALUES %L';

  constructor (
    indexerConfig: IndexerConfig,
    databaseConnectionParameters: PostgresConnectionParams,
    pgClientInstance: PgClient | undefined = undefined
  ) {
    const pgClient = pgClientInstance ?? new PgClient(databaseConnectionParameters);

    this.pgClient = pgClient;
    this.indexerConfig = indexerConfig;
  }

  private shouldLog (logLevel: LogLevel): boolean {
    return logLevel >= this.indexerConfig.logLevel;
  }

  async writeLogs (
    logEntries: LogEntry[],
  ): Promise<void> {
    const entriesArray = logEntries.filter(entry => this.shouldLog(entry.level));
    if (entriesArray.length === 0) return;

    const spanMessage = `write batch of ${entriesArray.length} logs through postgres`;
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

      const query = format(this.logInsertQueryTemplate, this.indexerConfig.schemaName(), values);
      await this.pgClient.query(query);
    }, `Failed to insert ${entriesArray.length > 1 ? 'logs' : 'log'} into the ${this.indexerConfig.schemaName()}.sys_logs table`)
      .finally(() => {
        writeLogSpan.end();
      });
  }

  async setStatus (status: IndexerStatus): Promise<void> {
    const setStatusSpan = this.tracer.startSpan(`set status to ${status} through postgres`);
    const values = [[MetadataFields.STATUS, status]];
    const setStatusQuery = format(METADATA_TABLE_UPSERT, this.indexerConfig.schemaName(), values);

    try {
      await wrapError(async () => await this.pgClient.query(setStatusQuery), `Failed to update status for ${this.indexerConfig.schemaName()}`);
    } finally {
      setStatusSpan.end();
    }
  }

  async updateBlockHeight (blockHeight: number): Promise<void> {
    const setLastProcessedBlockSpan = this.tracer.startSpan('set last processed block through postgres');
    const values = [[MetadataFields.LAST_PROCESSED_BLOCK_HEIGHT, blockHeight.toString()]];
    const updateBlockHeightQuery = format(METADATA_TABLE_UPSERT, this.indexerConfig.schemaName(), values);

    try {
      await wrapError(async () => await this.pgClient.query(updateBlockHeightQuery), `Failed to update last processed block height for ${this.indexerConfig.schemaName()}`);
    } finally {
      setLastProcessedBlockSpan.end();
    }
  }
}
