import IndexerConfig from '../indexer-config/indexer-config';
import { type LogLevel } from '../indexer-meta/log-entry';
import type PgClient from '../pg-client';
import { type IMemoryDb } from 'pg-mem';

export interface IndexerConfiguration {
  accountId: string
  indexerName: string
  logLevel: LogLevel
  logic: string
  schema: string
  filter: string
}

export default class IndexerProxy {
  private readonly indexerConfig: IndexerConfig;
  private readonly pgClient: PgClient;

  constructor (config: IndexerConfiguration, private readonly db: IMemoryDb) {
    this.indexerConfig = new IndexerConfig('', config.accountId, config.indexerName, 0, config.logic, config.schema, config.logLevel);
    this.pgClient = {
      end: () => { },
      query: async (schemaName: string) => {
        const schema = db.getSchema(schemaName);
        return schema?.listTables() ?? [];
      }
    } as unknown as PgClient;
  }

  public static from (indexerConfig: IndexerConfiguration, db: IMemoryDb): IndexerProxy {
    return new IndexerProxy(indexerConfig, db);
  }

  public async runOn (blocks: number[]): Promise<void> {
    console.log('Running indexer on blocks', blocks);
  }

  async executeOnBlock (block: number): Promise<void> {
  }

  async provision (): Promise<void> {
    // const userName = this.indexerConfig.userName();
    // const databaseName = this.indexerConfig.databaseName();
    // const schemaName = this.indexerConfig.schemaName();

    // Create DB if new (public DB)
    // Create schema and tables if new
  }
}
