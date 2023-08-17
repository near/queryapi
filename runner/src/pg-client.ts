import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
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
  public format: typeof pgFormatModule;

  constructor (
    connectionParams: ConnectionParams,
    poolConfig: PoolConfig = { max: 10, idleTimeoutMillis: 30000 },
    PgPool: typeof Pool = Pool,
    pgFormat: typeof pgFormatModule = pgFormatModule
  ) {
    this.pgPool = new PgPool({
      user: connectionParams.user,
      password: connectionParams.password,
      host: connectionParams.host,
      port: Number(connectionParams.port),
      database: connectionParams.database,
      ...poolConfig,
    });
    this.format = pgFormat;
  }

  async query<R extends QueryResultRow = any>(query: string, params: any[] = []): Promise<QueryResult<R>> {
    const client = await this.pgPool.connect();
    try {
      return await (client.query<R>(query, params));
    } finally {
      client.release();
    }
  }
}
