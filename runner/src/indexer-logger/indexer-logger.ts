import format from 'pg-format';
import { wrapError } from '../utility';
import PgClient from '../pg-client';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';
import { LogLevel } from '../stream-handler/stream-handler';

export interface LogEntry {
  blockHeight: number
  logTimestamp: Date
  logType: string
  logLevel: LogLevel
  message: string
}

export enum LogType {
  SYSTEM = 'system',
  USER = 'user',
}

export default class IndexerLogger {
  private readonly pgClient: PgClient;
  private readonly schemaName: string;
  private readonly logInsertQueryTemplate: string = 'INSERT INTO %I.__logs (block_height, date, timestamp, type, level, message) VALUES %L';

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

  async writeLog (
    logEntries: LogEntry | LogEntry[]
  ): Promise<void> {
    const entriesArray = Array.isArray(logEntries) ? logEntries : [logEntries];
    
    if (entriesArray.length === 0) return;
  
    const values = entriesArray.map(entry => [
      entry.blockHeight,
      entry.logTimestamp,
      entry.logTimestamp,
      entry.logType,
      LogLevel[entry.logLevel],
      entry.message
    ]);
  
    const query = format(
      this.logInsertQueryTemplate,
      this.schemaName,
      values
    );
  
    await wrapError(async () => await this.pgClient.query(query), `Failed to insert log${entriesArray.length > 1 ? 's' : ''} into ${this.schemaName}.__logs table`);
  }
}
