import format from 'pg-format';
import { wrapError } from '../utility';
import PgClient from '../pg-client';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';
import { LogLevel } from '../stream-handler/stream-handler';

export interface LogEntry {
  blockHeight: number;
  logTimestamp: Date;
  logType: string;
  logLevel: LogLevel;
  message: string;
}

export enum LogType {
  SYSTEM = 'system',
  USER = 'user',
}

export default class IndexerLogger {

  private readonly pgClient: PgClient;
  private readonly schemaName: string;

  constructor (
    functionName: string,
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
  }

  async writeLog(
    logEntry: LogEntry
  ): Promise<void> {
    const { blockHeight, logTimestamp, logType, logLevel, message } = logEntry;
    const logLevelString = LogLevel[logLevel];

    const values = [blockHeight, logTimestamp, logTimestamp, logType, logLevelString, message];

    const query = format(
        `INSERT INTO %I.__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES %L`,
        this.schemaName,
        [values] 
    );
    await wrapError(async () => await this.pgClient.query(query), `Failed to insert log into ${this.schemaName}.__logs table`);
  }

  async writeLogBatch(logEntries: LogEntry[]): Promise<void> {
    if(logEntries.length === 0) return;

    const values = logEntries.map(entry => [
      entry.blockHeight,
      entry.logTimestamp,
      entry.logTimestamp,
      entry.logType,
      LogLevel[entry.logLevel],
      entry.message
    ]);

    const query = format(
      `INSERT INTO %I.__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES %L`,
      this.schemaName, 
      values
    );

    await wrapError(async () => await this.pgClient.query(query), `Failed to insert batch of logs into ${this.schemaName}.__logs table`);
  }
}