import fs from 'fs';
import LocalIndexer from 'queryapi-runner/src/local-indexer';
import { LocalIndexerConfig } from 'queryapi-runner/src/indexer-config/indexer-config';
import { LogLevel } from 'queryapi-runner/src/indexer-meta/log-entry';
import path from 'path';

describe('Receiver Blocks Indexer Tests', () => {
  const indexerConfig: LocalIndexerConfig = LocalIndexerConfig.fromObject({
    accountId: 'account.near',
    functionName: 'sample_indexer',
    code: fs.readFileSync(path.join(__dirname, 'indexer.js'), 'utf8'),
    schema: fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'),
    logLevel: LogLevel.INFO,
  });

  test('Try executing on a block', async () => {
    const localIndexer = new LocalIndexer(indexerConfig);
    await localIndexer.executeOnBlock(123621232);
  });
});
