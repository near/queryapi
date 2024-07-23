import InMemoryDmlHandler from '../dml-handler/in-memory-dml-handler';
import IndexerConfig from '../indexer-config';
import { type LocalIndexerConfig } from '../indexer-config/indexer-config';
import NoOpIndexerMeta from '../indexer-meta/no-op-indexer-meta';
import Indexer from '../indexer/indexer';
import LakeClient from '../lake-client/lake-client';

export default class LocalIndexer {
  public readonly indexer: Indexer;
  private readonly lakeClient: LakeClient;

  constructor (config: LocalIndexerConfig) {
    const fullIndexerConfig: IndexerConfig = IndexerConfig.fromObject({
      redisStreamKey: 'local-indexer',
      accountId: config.accountId,
      functionName: config.functionName,
      version: 0,
      code: config.code,
      schema: config.schema,
      logLevel: config.logLevel,
    });
    const dmlHandler = new InMemoryDmlHandler(config.schema);
    const indexerMeta = new NoOpIndexerMeta(config);
    this.indexer = new Indexer(fullIndexerConfig, { indexerMeta, dmlHandler });
    this.lakeClient = new LakeClient();
  }

  async executeOnBlock (blockHeight: number): Promise<void> {
    // TODO: Cache Block data locally
    const block = await this.lakeClient.fetchBlock(blockHeight);
    await this.indexer.execute(block);
  }
}
