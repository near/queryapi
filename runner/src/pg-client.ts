import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import pgFormatModule from 'pg-format';

import logger from './logger';

export interface PostgresConnectionParams {
  user: string
  password: string
  host: string
  port: number | string
  database: string
}

export default class PgClient {
  private readonly logger = logger.child({ service: 'PgClient' });
  private readonly pgPool: Pool;
  public format: typeof pgFormatModule;

  constructor (
    connectionParams: PostgresConnectionParams,
    poolConfig: PoolConfig = { max: Number(process.env.MAX_PG_POOL_SIZE ?? 10), idleTimeoutMillis: 3000 },
    PgPool: typeof Pool = Pool,
    pgFormat: typeof pgFormatModule = pgFormatModule,
    onError: (err: Error) => void = (err) => { this.logger.error(err); }
  ) {
    this.pgPool = new PgPool({
      user: connectionParams.user,
      password: connectionParams.password,
      host: connectionParams.host,
      port: Number(connectionParams.port),
      database: connectionParams.database,
      ...poolConfig,
    });

    this.pgPool.on('error', onError);

    this.format = pgFormat;
  }

  async query<R extends QueryResultRow = any>(query: string, params: any[] = []): Promise<QueryResult<R>> {
    // Automatically manages client connections to pool
    return await this.pgPool.query<R>(query, params);
  }
}
