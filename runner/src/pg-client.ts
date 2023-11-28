import { Client, type QueryResult, type QueryResultRow } from 'pg';
import pgFormatModule from 'pg-format';

interface ConnectionParams {
  user: string
  password: string
  host: string
  port: number | string
  database: string
}

export default class PgClient {
  private readonly client: Client;
  public format: typeof pgFormatModule;

  constructor (
    connectionParams: ConnectionParams,
    pgFormat: typeof pgFormatModule = pgFormatModule,
  ) {
    this.client = new Client({
      user: connectionParams.user,
      password: connectionParams.password,
      host: connectionParams.host,
      port: Number(connectionParams.port),
      database: connectionParams.database,
      idle_in_transaction_session_timeout: 30000,
    });
    this.format = pgFormat;
  }

  async startConnection (): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to client');
      throw error;
    }
    await this.client.query('BEGIN');
    console.log('Postgres client connected. Transaction started successfully.');
  }

  async endConnection (failedQuery: boolean): Promise<void> {
    await this.client.query(failedQuery ? 'ROLLBACK' : 'COMMIT');
    await this.client.end();
    console.log(`Transaction ${failedQuery ? 'rolled back' : 'comitted'} successfully. Postgres client disconnected.`);
  }

  async query<R extends QueryResultRow = any>(query: string, params: any[] = []): Promise<QueryResult<R>> {
    return await this.client.query<R>(query, params);
  }
}
