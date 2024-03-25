import { wrapError } from '../utility';
import PgClient from '../pg-client';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';
import { LogLevel } from '../stream-handler/stream-handler';
  
export default class IndexerLogger {

  private constructor (
    private readonly pgClient: PgClient
  ) {}

  private extractDateParts(date: Date): { year: number, month: number, day: number } {
    return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate()
    };
  }

  formatDate(date: Date): Date {
    const { year, month, day } = this.extractDateParts(date);
    return new Date(year, month, day);
  }

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
  
  async writeLog(
    blockHeight: number,
    functionName: string,
    logDate: Date,
    logTimestamp: Date,
    logType: string,
    logLevel: LogLevel,
    message: string,
    ): Promise<void> {
    const schemaName = functionName.replace(/[^a-zA-Z0-9]/g, '_');
    
    const formattedLogDate = this.formatDate(logDate);
    const logLevelString = LogLevel[logLevel];

    const query = 
      `INSERT INTO ${schemaName}.__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES ($1, $2, $3, $4, $5, $6)`;

    const values = [blockHeight, formattedLogDate, logTimestamp, logType, logLevelString, message];

    await wrapError(async () => await this.pgClient.query(query, values), `Failed to execute '${query}' on ${schemaName}`);
  }
}