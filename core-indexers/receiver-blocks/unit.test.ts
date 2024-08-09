import fs from 'fs';
import LocalIndexer from 'queryapi-runner/src/indexer/local-indexer';
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
    const context = localIndexer.getContext();

    // Run on one block to populate receivers table and initial bitmap
    await localIndexer.executeOnBlock(100000000);
    const receivers = await context.db.Receivers.select({
      receiver: 'app.nearcrowd.near'
    });
    const tokenSweatId = receivers[0].id;

    const correctBitmapOne = {
      first_block_height: 100000000,
      block_date: '2023-08-30',
      receiver_id: tokenSweatId,
      bitmap: 'wA==',
      last_elias_gamma_start_bit: 1,
      max_index: 0,
    };
    const correctBitmapTwo = {
      first_block_height: 100000000,
      block_date: '2023-08-30',
      receiver_id: tokenSweatId,
      bitmap: 'oA==',
      last_elias_gamma_start_bit: 1,
      max_index: 1,
    };

    let bitmap = await context.db.Bitmaps.select({
      receiver_id: tokenSweatId
    });
    expect(bitmap.length).toBe(1);
    expect(bitmap[0]).toEqual(correctBitmapOne);

    // Run on second block and verify bitmap update
    await localIndexer.executeOnBlock(100000001);
    bitmap = await context.db.Bitmaps.select({
      receiver_id: tokenSweatId
    });
    expect(bitmap.length).toBe(1);
    expect(bitmap[0]).toEqual(correctBitmapTwo);
  });
});
