import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import pgFormatModule from 'pg-format';
import HasuraClient from '../hasura-client';

interface ConnectionParams {
  user: string
  password: string
  host: string
  port: number | string
  database: string
}

export default class PgClient {
  private readonly connectionParams: ConnectionParams;
  private readonly hasuraClient: HasuraClient;
  private readonly poolConfig: PoolConfig;
  private pgPool: Pool;
  public format: typeof pgFormatModule;
  private userPasswords: Record<string, string>;

  constructor (
    connectionParams: ConnectionParams,
    hasuraClient: HasuraClient = new HasuraClient(),
    poolConfig: PoolConfig = { max: 10, idleTimeoutMillis: 30000 },
    PgPool: typeof Pool = Pool,
    pgFormat: typeof pgFormatModule = pgFormatModule
  ) {
    this.connectionParams = connectionParams;
    this.hasuraClient = hasuraClient;
    this.poolConfig = poolConfig;
    this.pgPool = new PgPool({
      user: connectionParams.user,
      password: connectionParams.password,
      host: connectionParams.host,
      port: Number(connectionParams.port),
      database: connectionParams.database,
      ...poolConfig,
    });
    this.format = pgFormat;
    this.userPasswords = {};
  }

  private async collectPasswords (): Promise<void> {
    const metadata = await this.hasuraClient.exportMetadata();
    console.log(metadata.sources[2].configuration.connection_info.database_url.connection_parameters);
    this.userPasswords = metadata.sources.reduce((prev: any, source: { name: any, configuration: any }) => ({
      ...prev,
      [source.name]: source.name === 'default' ? 'N/A' : source.configuration.connection_info.database_url.connection_parameters.password
    }), {});
  }

  async setUser (user: string): Promise<void> {
    if (Object.keys(this.userPasswords).length === 0) {
      console.log('Collecting passwords for each user.');
      await this.collectPasswords();
    }

    const newUser = user === 'admin' ? this.connectionParams.user : user;
    const newPassword = user === 'admin' ? this.connectionParams.password : this.userPasswords[user];

    if (newPassword === undefined) {
      throw new Error(`Could not find password for user ${user} when trying to set user account to process database actions.`);
    }

    this.pgPool = new Pool({
      user: newUser,
      password: newPassword,
      host: this.connectionParams.host,
      port: Number(this.connectionParams.port),
      database: this.connectionParams.database,
      ...this.poolConfig,
    });
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
