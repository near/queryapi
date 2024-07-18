import pgFormat from 'pg-format';
import DmlHandler from './dml-handler';
import type PgClient from '../pg-client';
import { type TableDefinitionNames } from '../indexer';
import { type PostgresConnectionParams } from '../pg-client';
import IndexerConfig from '../indexer-config/indexer-config';
import { LogLevel } from '../indexer-meta/log-entry';

describe('DML Handler tests', () => {
  const getDbConnectionParameters: PostgresConnectionParams = {
    database: 'test_account',
    host: 'postgres',
    password: 'test_pass',
    port: 5432,
    user: 'test_account'
  };
  let pgClient: PgClient;
  let query: any;

  const TEST_INDEXER_CONFIG = new IndexerConfig('', 'test_account', 'test_function', 0, '', '', LogLevel.INFO);
  let TABLE_DEFINITION_NAMES: TableDefinitionNames;

  beforeEach(() => {
    query = jest.fn().mockReturnValue({ rows: [] });
    pgClient = {
      query,
      format: pgFormat
    } as unknown as PgClient;
    TABLE_DEFINITION_NAMES = {
      tableName: 'test_table',
      originalTableName: '"test_table"',
      originalColumnNames: new Map<string, string>([
        ['account_id', 'account_id'],
        ['block_height', '"block_height"'],
        ['block_timestamp', 'block_timestamp'],
        ['content', '"content"'],
        ['receipt_id', 'receipt_id'],
        ['accounts_liked', '"accounts_liked"']
      ])
    };
  });

  test('Test valid insert one with array', async () => {
    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
      block_timestamp: 'UTC',
      content: 'test_content',
      receipt_id: 111,
      accounts_liked: JSON.stringify(['cwpuzzles.near', 'devbose.near'])
    };

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, [inputObj]);
    expect(query.mock.calls).toEqual([
      ['INSERT INTO test_account_test_function."test_table" (account_id, "block_height", block_timestamp, "content", receipt_id, "accounts_liked") VALUES (\'test_acc_near\', \'999\', \'UTC\', \'test_content\', \'111\', \'["cwpuzzles.near","devbose.near"]\') RETURNING *', []]
    ]);
  });

  test('Test valid insert multiple rows with array', async () => {
    const inputObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
    }];

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.insert(TABLE_DEFINITION_NAMES, inputObj);
    expect(query.mock.calls).toEqual([
      ['INSERT INTO test_account_test_function."test_table" (account_id, "block_height", receipt_id) VALUES (\'morgs_near\', \'1\', \'abc\'), (\'morgs_near\', \'2\', \'abc\') RETURNING *', []]
    ]);
  });

  test('Test valid select on two fields with unquoted table name', async () => {
    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    TABLE_DEFINITION_NAMES.originalTableName = 'test_table';

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.select(TABLE_DEFINITION_NAMES, inputObj);
    expect(query.mock.calls).toEqual([
      ['SELECT * FROM test_account_test_function.test_table WHERE account_id=$1 AND "block_height"=$2', Object.values(inputObj)]
    ]);
  });

  test('Test valid select with a single column condition and multiple column conditions', async () => {
    const inputObj = {
      account_id: ['test_acc_near1', 'test_acc_near2'],
      block_height: 999,
    };

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.select(TABLE_DEFINITION_NAMES, inputObj);
    expect(query.mock.calls).toEqual([
      ['SELECT * FROM test_account_test_function."test_table" WHERE account_id IN ($1,$2) AND "block_height"=$3', [...inputObj.account_id, inputObj.block_height]]
    ]);
  });

  test('Test valid select with two multiple column conditions', async () => {
    const inputObj = {
      account_id: ['test_acc_near1', 'test_acc_near2'],
      block_height: [998, 999],
    };

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.select(TABLE_DEFINITION_NAMES, inputObj);
    expect(query.mock.calls).toEqual([
      ['SELECT * FROM test_account_test_function."test_table" WHERE account_id IN ($1,$2) AND "block_height" IN ($3,$4)', [...inputObj.account_id, ...inputObj.block_height]]
    ]);
  });

  test('Test valid select on two fields with limit', async () => {
    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.select(TABLE_DEFINITION_NAMES, inputObj, 1);
    expect(query.mock.calls).toEqual([
      ['SELECT * FROM test_account_test_function."test_table" WHERE account_id=$1 AND "block_height"=$2 LIMIT 1', Object.values(inputObj)]
    ]);
  });

  test('Test valid update on two fields', async () => {
    const whereObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    const updateObj = {
      content: 'test_content',
      receipt_id: 111,
    };

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.update(TABLE_DEFINITION_NAMES, whereObj, updateObj);
    expect(query.mock.calls).toEqual([
      ['UPDATE test_account_test_function."test_table" SET "content"=$1, receipt_id=$2 WHERE account_id=$3 AND "block_height"=$4 RETURNING *', [...Object.values(updateObj), ...Object.values(whereObj)]]
    ]);
  });

  test('Test valid upsert on two fields', async () => {
    const inputObj = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc'
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc'
    }];

    const conflictCol = ['account_id', 'block_height'];
    const updateCol = ['receipt_id'];

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.upsert(TABLE_DEFINITION_NAMES, inputObj, conflictCol, updateCol);
    expect(query.mock.calls).toEqual([
      ['INSERT INTO test_account_test_function."test_table" (account_id, "block_height", receipt_id) VALUES (\'morgs_near\', \'1\', \'abc\'), (\'morgs_near\', \'2\', \'abc\') ON CONFLICT (account_id, "block_height") DO UPDATE SET receipt_id = excluded.receipt_id RETURNING *', []]
    ]);
  });

  test('Test valid delete with a single column condition and multiple column conditions', async () => {
    const inputObj = {
      account_id: 'test_acc_near',
      block_height: [998, 999],
    };

    const dmlHandler = new DmlHandler(getDbConnectionParameters, TEST_INDEXER_CONFIG, pgClient);

    await dmlHandler.delete(TABLE_DEFINITION_NAMES, inputObj);
    expect(query.mock.calls).toEqual([
      ['DELETE FROM test_account_test_function."test_table" WHERE account_id=$1 AND "block_height" IN ($2,$3) RETURNING *', [inputObj.account_id, ...inputObj.block_height]]
    ]);
  });
});
