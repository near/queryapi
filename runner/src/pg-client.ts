import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import pgFormatModule from 'pg-format';

interface ConnectionParams {
  user: string
  password: string
  host: string
  port: number | string
  database: string
}

export default class PgClient {
  private readonly pgPool: Pool;
  private pgClient: PoolClient | undefined;
  public format: typeof pgFormatModule;

  constructor (
    connectionParams: ConnectionParams,
    poolConfig: PoolConfig = { max: 10, idleTimeoutMillis: 30000 },
    PgPool: typeof Pool = Pool,
    pgFormat: typeof pgFormatModule = pgFormatModule,
  ) {
    this.pgPool = new PgPool({
      user: connectionParams.user,
      password: connectionParams.password,
      host: connectionParams.host,
      port: Number(connectionParams.port),
      database: connectionParams.database,
      ...poolConfig,
    });
    this.pgClient = undefined;
    this.format = pgFormat;
  }

  async transactionStart (): Promise<void> {
    this.pgClient = await this.pgPool.connect();
    await this.pgClient.query('BEGIN');
    console.log('Transaction started successfully. Postgres client connected.');
  }

  async transactionCommit (): Promise<void> {
    if (!this.pgClient) {
      throw new Error('No client to commit transaction with.');
    }
    await this.pgClient.query('COMMIT');
    this.pgClient.release();
    this.pgClient = undefined;
    console.log('Transaction committed successfully. Postgres client disconnected.');
  }

  async transactionRollback (): Promise<void> {
    if (!this.pgClient) {
      console.warn('No client to rollback transaction with.');
      return;
    }
    await this.pgClient.query('ROLLBACK');
    this.pgClient.release();
    this.pgClient = undefined;
    console.log('Transaction rolled back successfully. Postgres client disconnected.');
  }

  async query<R extends QueryResultRow = any>(query: string, params: any[] = []): Promise<QueryResult<R>> {
    if (!this.pgClient) {
      throw new Error('No client to execute query with.');
    }
    // Automatically manages client connections to pool
    return await this.pgClient.query<R>(query, params);
  }
}
