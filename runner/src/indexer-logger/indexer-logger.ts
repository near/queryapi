import { wrapError } from '../utility';
import PgClient from '../pg-client';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';
import { LogLevel } from '../stream-handler/stream-handler';

export interface LogEntry {
  blockHeight: number;
  functionName: string;
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

  private constructor (
    private readonly pgClient: PgClient
  ) {}

  static create (
    databaseConnectionParameters: DatabaseConnectionParameters,
    pgClientInstance: PgClient | undefined = undefined
  ): IndexerLogger {
    const pgClient = pgClientInstance ?? new PgClient({
      user: databaseConnectionParameters.username,
      password: databaseConnectionParameters.password,
      host: process.env.PGHOST,
      port: Number(databaseConnectionParameters.port),
      database: databaseConnectionParameters.database,
    });
    return new IndexerLogger(pgClient);
  }
  //todo add or remove format date and update test based off if we want to use it for batch inserts

  formatDate(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  
  async writeLog(
    blockHeight: number,
    functionName: string,
    logTimestamp: Date,
    logType: string,
    logLevel: LogLevel,
    message: string,
    ): Promise<void> {
    const schemaName = functionName.replace(/[^a-zA-Z0-9]/g, '_');
    const logDate = new Date(logTimestamp.getFullYear(), logTimestamp.getMonth(), logTimestamp.getDate());
    const logLevelString = LogLevel[logLevel];

    const query = 
      `INSERT INTO ${schemaName}.__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES ($1, $2, $3, $4, $5, $6)`;

    const values = [blockHeight, logDate, logTimestamp, logType, logLevelString, message];

    await wrapError(async () => await this.pgClient.query(query, values), `Failed to execute '${query}' on ${schemaName}`);
  }

  //todo: add batch insert inside runfunction
  async writeLogBatch(logEntries: LogEntry[]): Promise<void> {
    if(logEntries.length === 0) return;

    const schemaName = logEntries[0].functionName.replace(/[^a-zA-Z0-9]/g, '_');

    const values = logEntries.map(entry => [
      entry.blockHeight,
      this.formatDate(entry.logTimestamp),
      entry.logTimestamp,
      entry.logType,
      LogLevel[entry.logLevel],
      entry.message
  ]);

    const valuePlaceholders = logEntries.map((_, index) => `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`).join(', ');
    const query =
        `INSERT INTO ${schemaName}.__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES ${valuePlaceholders}`;

    const flattenedValues = values.flat();
    await wrapError(async () => await this.pgClient.query(query, flattenedValues), `Failed to execute '${query}' on ${schemaName}`);
  }
}
    