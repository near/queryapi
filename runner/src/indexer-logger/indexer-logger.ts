import format from 'pg-format';
import { wrapError } from '../utility';
import PgClient from '../pg-client';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';
import { type IndexerStatus } from '../stream-handler/stream-handler';
import { trace } from '@opentelemetry/api';

export interface LogEntry {
  blockHeight: number
  logTimestamp: Date
  logType: LogType
  logLevel: LogLevel
  message: string
}

export enum LogLevel {
  DEBUG = 2,
  INFO = 5,
  WARN = 6,
  ERROR = 8,
}

export enum LogType {
  SYSTEM = 'system',
  USER = 'user',
}

const METADATA_TABLE_UPSERT = 'INSERT INTO %I.__metadata (function_name, attribute, value) VALUES %L ON CONFLICT (function_name, attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *';
const STATUS_ATTRIBUTE = 'STATUS';
const LAST_PROCESSED_BLOCK_HEIGHT_ATTRIBUTE = 'LAST_PROCESSED_BLOCK_HEIGHT';

export default class IndexerLogger {
  tracer = trace.getTracer('queryapi-runner-indexer-logger');

  private readonly pgClient: PgClient;
  private readonly schemaName: string;
  private readonly logInsertQueryTemplate: string = 'INSERT INTO %I.__logs (block_height, date, timestamp, type, level, message) VALUES %L';
  private readonly loggingLevel: number;

  constructor (
    functionName: string,
    loggingLevel: number,
    databaseConnectionParameters: DatabaseConnectionParameters,
    pgClientInstance: PgClient | undefined = undefined
  ) {
    const pgClient = pgClientInstance ?? new PgClient({
      user: databaseConnectionParameters.username,
      password: databaseConnectionParameters.password,
      host: process.env.PGHOST,
      port: Number(databaseConnectionParameters.port),
      database: databaseConnectionParameters.database,
    });

    this.pgClient = pgClient;
    this.schemaName = functionName.replace(/[^a-zA-Z0-9]/g, '_');
    this.loggingLevel = loggingLevel;
  }

  private shouldLog (logLevel: LogLevel): boolean {
    return logLevel >= this.loggingLevel;
  }

  async writeLogs (
    logEntries: LogEntry | LogEntry[],
  ): Promise<void> {
    const entriesArray = (Array.isArray(logEntries) ? logEntries : [logEntries]).filter(entry => this.shouldLog(entry.logLevel)); ;
    if (entriesArray.length === 0) return;

    const spanMessage = `write log for ${entriesArray.length === 1 ? 'single entry' : `batch of ${entriesArray.length}`} through postgres `;
    const writeLogSpan = this.tracer.startSpan(spanMessage);

    await wrapError(async () => {
      const values = entriesArray.map(entry => [
        entry.blockHeight,
        entry.logTimestamp,
        entry.logTimestamp,
        entry.logType,
        LogLevel[entry.logLevel],
        entry.message
      ]);

      const query = format(this.logInsertQueryTemplate, this.schemaName, values);
      await this.pgClient.query(query);
    }, `Failed to insert ${entriesArray.length > 1 ? 'logs' : 'log'} into the ${this.schemaName}.__logs table`)
      .finally(() => {
        writeLogSpan.end();
      });
  }

  async updateIndexerStatus (status: IndexerStatus): Promise<void> {
    const setStatusSpan = this.tracer.startSpan(`set status of indexer to ${status} through postgres`);
    const values = [[this.schemaName, STATUS_ATTRIBUTE, status]];
    const query = format(METADATA_TABLE_UPSERT, this.schemaName, values);

    try {
      await wrapError(async () => await this.pgClient.query(query), `Failed to update status for ${this.schemaName}`);
    } finally {
      setStatusSpan.end();
    }
  }

  async updateIndexerBlockheight (blockHeight: number): Promise<void> {
    const setLastProcessedBlockSpan = this.tracer.startSpan(`set last processed block to ${blockHeight} through postgres`);
    const values = [[this.schemaName, LAST_PROCESSED_BLOCK_HEIGHT_ATTRIBUTE, blockHeight.toString()]];
    const query = format(METADATA_TABLE_UPSERT, this.schemaName, values);

    try {
      await wrapError(async () => await this.pgClient.query(query), `Failed to update last processed block height for ${this.schemaName}`);
    } finally {
      setLastProcessedBlockSpan.end();
    }
  }
}
