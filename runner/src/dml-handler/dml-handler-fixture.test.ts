import { TableDefinitionNames } from "../indexer";
import InMemoryDmlHandler from "./dml-handler-fixture";

describe('DML Handler Fixture Tests', () => {
  const SIMPLE_SCHEMA = `CREATE TABLE
    "posts" (
      "id" SERIAL NOT NULL,
      "account_id" VARCHAR NOT NULL,
      "block_height" DECIMAL(58, 0) NOT NULL,
      "receipt_id" VARCHAR NOT NULL,
      "content" TEXT NOT NULL,
      "block_timestamp" DECIMAL(20, 0) NOT NULL,
      "accounts_liked" JSONB NOT NULL DEFAULT '[]',
      "last_comment_timestamp" DECIMAL(20, 0),
      CONSTRAINT "posts_pkey" PRIMARY KEY ("id", "account_id")
    );`;
  let TABLE_DEFINITION_NAMES: TableDefinitionNames = {
    originalTableName: 'posts',
    originalColumnNames: new Map<string, string>([])
  };

  let dmlHandler: InMemoryDmlHandler;

  beforeEach(() => {
    dmlHandler = new InMemoryDmlHandler(SIMPLE_SCHEMA);
  });

  test('insert two rows', async () => {
    const inputObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    }];

    const correctResult = [{
      id: 0,
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    },
    {
      id: 1,
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    }];

    const result = await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);
    expect(result).toEqual(correctResult);
  });

  test('select rows', async () => {
    const inputObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const selectA = await dmlHandler.select(TABLE_DEFINITION_NAMES, { id: 1 });
    expect(selectA[0].id).toEqual(1);

    const selectB = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'morgs_near', block_height: [1, 2] });
    expect(selectB[0].account_id).toEqual('morgs_near');
    expect(selectB[1].account_id).toEqual('morgs_near');
    expect(selectB[0].block_height).toEqual(1);
    expect(selectB[1].block_height).toEqual(2);

    expect(await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'unknown_near' })).toEqual([]);
  });

  test('update rows', async () => {
    const inputObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const updateOne = await dmlHandler.update(TABLE_DEFINITION_NAMES, { account_id: 'morgs_near', block_height: 2 }, { content: 'updated content' });
    const selectOneUpdate = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'morgs_near', block_height: 2 });
    expect(updateOne).toEqual(selectOneUpdate);

    const updateAll = await dmlHandler.update(TABLE_DEFINITION_NAMES, { account_id: 'morgs_near' }, { content: 'final content' });
    const selectAllUpdated = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'morgs_near' });
    expect(updateAll).toEqual(selectAllUpdated);
  });

  test('upsert rows', async () => {
    const inputObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: "INSERT",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const upsertObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: "UPSERT",
      block_timestamp: 456,
      accounts_liked: [],
      last_comment_timestamp: 456
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: "UPSERT",
      block_timestamp: 456,
      accounts_liked: [],
      last_comment_timestamp: 456
    }];

    const upserts = await dmlHandler.upsert(TABLE_DEFINITION_NAMES, upsertObj, ['account_id', 'block_height'], ['content', 'block_timestamp']);

    const selectAll = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'morgs_near' });
    expect(upserts).toEqual(selectAll);
  });

  test('delete rows', async () => {
    const inputObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: "some content",
      block_timestamp: 123,
      accounts_liked: [],
      last_comment_timestamp: 456
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const deletedRows = await dmlHandler.delete(TABLE_DEFINITION_NAMES, { account_id: 'morgs_near' });

    expect(deletedRows).toEqual(inputObj);
  })
});
