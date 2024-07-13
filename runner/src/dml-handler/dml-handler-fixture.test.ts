import { TableDefinitionNames } from "../indexer";
import InMemoryDmlHandler from "./dml-handler-fixture";

describe('DML Handler Fixture Tests', () => {
  const SIMPLE_SCHEMA = `CREATE TABLE
    "posts" (
      "id" SERIAL NOT NULL,
      "account_id" VARCHAR NOT NULL,
      "block_height" DECIMAL(58, 0) NOT NULL,
      "content" TEXT NOT NULL,
      "accounts_liked" JSONB NOT NULL DEFAULT '[]',
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

  test('select rows', async () => {
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const selectSingleValue = await dmlHandler.select(TABLE_DEFINITION_NAMES, { id: 1 });
    expect(selectSingleValue[0].id).toEqual(1);

    const selectMultipleValues = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'TEST_NEAR', block_height: [1, 2] });
    expect(selectMultipleValues[0].account_id).toEqual('TEST_NEAR');
    expect(selectMultipleValues[1].account_id).toEqual('TEST_NEAR');
    expect(selectMultipleValues[0].block_height).toEqual(1);
    expect(selectMultipleValues[1].block_height).toEqual(2);

    expect(await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'unknown_near' })).toEqual([]);
  });

  test('insert two rows with serial ID column', async () => {
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    const correctResult = [{
      id: 0,
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      id: 1,
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    const result = await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);
    expect(result).toEqual(correctResult);
  });

  test('reject insert after specifying serial column value', async () => {
    const inputObjWithSerial = [{
      id: 0, // Specifying a serial value does not change the next produced serial value (Which would be 0 in this case)
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    }];
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObjWithSerial);
    await expect(dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj)).rejects.toThrow('Cannot insert row twice into the same table');
  });

  test('reject insert after not specifying primary key value', async () => {
    const inputObj = [{
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    }];

    await expect(dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj)).rejects.toThrow('Inserted row must specify value for primary key columns');
  });

  test('update rows', async () => {
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const updateOne = await dmlHandler.update(TABLE_DEFINITION_NAMES, { account_id: 'TEST_NEAR', block_height: 2 }, { content: 'UPDATED_CONTENT' });
    const selectOneUpdate = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'TEST_NEAR', block_height: 2 });
    expect(updateOne).toEqual(selectOneUpdate);

    const updateAll = await dmlHandler.update(TABLE_DEFINITION_NAMES, { account_id: 'TEST_NEAR' }, { content: 'final content' });
    const selectAllUpdated = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'TEST_NEAR' });
    expect(updateAll).toEqual(selectAllUpdated);
  });

  test('update criteria matches nothing', async () => {
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const updateNone = await dmlHandler.update(TABLE_DEFINITION_NAMES, { account_id: 'none_near' }, { content: 'UPDATED_CONTENT' });
    const selectUpdated = await dmlHandler.select(TABLE_DEFINITION_NAMES, { content: 'UPDATED_CONTENT' });
    expect(updateNone).toEqual([]);
    expect(selectUpdated).toEqual([]);
  });

  test('upsert rows', async () => {
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "INSERT",
      accounts_liked: [],
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const upsertObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "UPSERT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "UPSERT",
      accounts_liked: [],
    }];

    const upserts = await dmlHandler.upsert(TABLE_DEFINITION_NAMES, upsertObj, ['account_id', 'block_height'], ['content', 'block_timestamp']);

    const selectAll = await dmlHandler.select(TABLE_DEFINITION_NAMES, { account_id: 'TEST_NEAR' });
    expect(upserts).toEqual(selectAll);
  });

  test('upsert rows with non unique conflcit columns', async () => {
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const upsertObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "UPSERT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "UPSERT",
      accounts_liked: [],
    }];

    await expect(dmlHandler.upsert(TABLE_DEFINITION_NAMES, upsertObj, ['account_id'], ['content', 'block_timestamp'])).rejects.toThrow('Conflict update criteria cannot match multiple rows');
  });

  test('delete rows', async () => {
    const inputObj = [{
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    const correctResponse = [{
      id: 0,
      account_id: 'TEST_NEAR',
      block_height: 1,
      content: "CONTENT",
      accounts_liked: [],
    },
    {
      id: 1,
      account_id: 'TEST_NEAR',
      block_height: 2,
      content: "CONTENT",
      accounts_liked: [],
    }];

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);

    const deletedRows = await dmlHandler.delete(TABLE_DEFINITION_NAMES, { account_id: 'TEST_NEAR' });

    expect(deletedRows).toEqual(correctResponse);
  })
});
