import ContextBuilder, { type ContextObject } from '../context-builder';
import InMemoryDmlHandler from '../context-builder/dml-handler/in-memory-dml-handler';
import IndexerConfig from 'src/indexer-config';
import { type LocalIndexerConfig } from 'src/indexer-config';
import NoOpIndexerMeta from 'src/indexer-meta/no-op-indexer-meta';
import Indexer from 'src/indexer';
import LakeClient from 'src/lake-client/lake-client';

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
    const contextBuilder = new ContextBuilder(fullIndexerConfig, { dmlHandler });
    const indexerMeta = new NoOpIndexerMeta(config);
    this.indexer = new Indexer(fullIndexerConfig, { indexerMeta, contextBuilder });
    this.lakeClient = new LakeClient();
  }

  getContext (): ContextObject {
    return this.indexer.deps.contextBuilder.buildContext(0, []);
  }

  async executeOnBlock (blockHeight: number): Promise<void> {
    // TODO: Cache Block data locally
    const block = await this.lakeClient.fetchBlock(blockHeight);
    await this.indexer.execute(block);
  }
}
