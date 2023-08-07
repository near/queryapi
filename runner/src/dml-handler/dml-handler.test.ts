import pgFormat from 'pg-format';
import DmlHandler from './dml-handler';

describe('DML Handler tests', () => {
  let pgClient: any;

  const SCHEMA = 'test_schema';
  const TABLE_NAME = 'test_table';

  test('Test valid insert one with array', async () => {
    pgClient = {
      query: jest.fn().mockReturnValue({ rows: [] }),
      format: pgFormat,
    };

    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
      block_timestamp: 'UTC',
      content: 'test_content',
      receipt_id: 111,
      accounts_liked: JSON.stringify(['cwpuzzles.near', 'devbose.near'])
    };

    const dmlHandler = new DmlHandler(pgClient);

    await dmlHandler.insert(SCHEMA, TABLE_NAME, [inputObj]);
    expect(pgClient.query.mock.calls).toEqual([
      ['INSERT INTO test_schema.test_table (account_id,block_height,block_timestamp,content,receipt_id,accounts_liked) VALUES (\'test_acc_near\', \'999\', \'UTC\', \'test_content\', \'111\', \'["cwpuzzles.near","devbose.near"]\') RETURNING *;', []]
    ]);
  });

  test('Test valid insert multiple rows with array', async () => {
    pgClient = {
      query: jest.fn().mockReturnValue({ rows: [] }),
      format: pgFormat,
    };

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

    const dmlHandler = new DmlHandler(pgClient);

    await dmlHandler.insert(SCHEMA, TABLE_NAME, [inputObj]);
    expect(pgClient.query.mock.calls).toEqual([
      ['INSERT INTO test_schema.test_table (0,1) VALUES (\'{"account_id":"morgs_near","block_height":1,"receipt_id":"abc"}\'::jsonb, \'{"account_id":"morgs_near","block_height":2,"receipt_id":"abc"}\'::jsonb) RETURNING *;', []]
    ]);
  });

  test('Test valid select on two fields', async () => {
    pgClient = {
      query: jest.fn().mockReturnValue({ rows: [] }),
      format: pgFormat,
    };

    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    const dmlHandler = new DmlHandler(pgClient);

    await dmlHandler.select(SCHEMA, TABLE_NAME, inputObj, 0);
    expect(pgClient.query.mock.calls).toEqual([
      ['SELECT * FROM test_schema.test_table WHERE account_id=$1 AND block_height=$2;', Object.values(inputObj)]
    ]);
  });

  test('Test valid select on two fields with limit', async () => {
    pgClient = {
      query: jest.fn().mockReturnValue({ rows: [] }),
      format: pgFormat,
    };

    const inputObj = {
      account_id: 'test_acc_near',
      block_height: 999,
    };

    const dmlHandler = new DmlHandler(pgClient);

    await dmlHandler.select(SCHEMA, TABLE_NAME, inputObj, 1);
    expect(pgClient.query.mock.calls).toEqual([
      ['SELECT * FROM test_schema.test_table WHERE account_id=$1 AND block_height=$2 LIMIT 1;', Object.values(inputObj)]
    ]);
  });
});
