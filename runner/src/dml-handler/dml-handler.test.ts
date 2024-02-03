import pgFormat from 'pg-format';
import DmlHandler from './dml-handler';

describe('DML Handler tests', () => {
  const hasuraClient: any = {
    getDbConnectionParameters: jest.fn().mockReturnValue({
      database: 'test_near',
      host: 'postgres',
      password: 'test_pass',
      port: 5432,
      username: 'test_near'
    })
  };
  let PgClient: any;
  let query: any;

  const ACCOUNT = 'test_near';
  const SCHEMA = 'test_schema';
  const TABLE_NAME = 'test_table';

  beforeEach(() => {
    query = jest.fn().mockReturnValue({ rows: [] });
    PgClient = jest.fn().mockImplementation(() => {
      return { query, format: pgFormat };
    });
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

    const dmlHandler = DmlHandler.createLazy(ACCOUNT, hasuraClient, PgClient);

    await dmlHandler.insert(SCHEMA, TABLE_NAME, [inputObj]);
    expect(query.mock.calls).toEqual([
      ['INSERT INTO test_schema."test_table" (account_id, block_height, block_timestamp, content, receipt_id, accounts_liked) VALUES (\'test_acc_near\', \'999\', \'UTC\', \'test_content\', \'111\', \'["cwpuzzles.near","devbose.near"]\') RETURNING *', []]
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

    const dmlHandler = DmlHandler.createLazy(ACCOUNT, hasuraClient, PgClient);

    await dmlHandler.insert(SCHEMA, TABLE_NAME, inputObj);
    expect(query.mock.calls).toEqual([
      ['INSERT INTO test_schema."test_table" (account_id, block_height, receipt_id) VALUES (\'morgs_near\', \'1\', \'abc\'), (\'morgs_near\', \'2\', \'abc\') RETURNING *', []]
    ]);
  });

  test('Test valid select on two fields', async () => {
    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    const dmlHandler = DmlHandler.createLazy(ACCOUNT, hasuraClient, PgClient);

    await dmlHandler.select(SCHEMA, TABLE_NAME, inputObj);
    expect(query.mock.calls).toEqual([
      ['SELECT * FROM test_schema."test_table" WHERE account_id=$1 AND block_height=$2', Object.values(inputObj)]
    ]);
  });

  test('Test valid select on two fields with limit', async () => {
    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    const dmlHandler = DmlHandler.createLazy(ACCOUNT, hasuraClient, PgClient);

    await dmlHandler.select(SCHEMA, TABLE_NAME, inputObj, 1);
    expect(query.mock.calls).toEqual([
      ['SELECT * FROM test_schema."test_table" WHERE account_id=$1 AND block_height=$2 LIMIT 1', Object.values(inputObj)]
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

    const dmlHandler = DmlHandler.createLazy(ACCOUNT, hasuraClient, PgClient);

    await dmlHandler.update(SCHEMA, TABLE_NAME, whereObj, updateObj);
    expect(query.mock.calls).toEqual([
      ['UPDATE test_schema."test_table" SET content=$1, receipt_id=$2 WHERE account_id=$3 AND block_height=$4 RETURNING *', [...Object.values(updateObj), ...Object.values(whereObj)]]
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

    const dmlHandler = DmlHandler.createLazy(ACCOUNT, hasuraClient, PgClient);

    await dmlHandler.upsert(SCHEMA, TABLE_NAME, inputObj, conflictCol, updateCol);
    expect(query.mock.calls).toEqual([
      ['INSERT INTO test_schema."test_table" (account_id, block_height, receipt_id) VALUES (\'morgs_near\', \'1\', \'abc\'), (\'morgs_near\', \'2\', \'abc\') ON CONFLICT (account_id, block_height) DO UPDATE SET receipt_id = excluded.receipt_id RETURNING *', []]
    ]);
  });

  test('Test valid delete on two fields', async () => {
    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    const dmlHandler = DmlHandler.createLazy(ACCOUNT, hasuraClient, PgClient);

    await dmlHandler.delete(SCHEMA, TABLE_NAME, inputObj);
    expect(query.mock.calls).toEqual([
      ['DELETE FROM test_schema."test_table" WHERE account_id=$1 AND block_height=$2 RETURNING *', Object.values(inputObj)]
    ]);
  });
});
