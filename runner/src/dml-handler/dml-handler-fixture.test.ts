import { TableDefinitionNames } from "../indexer";
import DmlHandlerFixture from "./dml-handler-fixture";

describe('DML Handler Fixture Tests', () => {
  let TABLE_DEFINITION_NAMES: TableDefinitionNames = {
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

  let dmlHandlerFixture: DmlHandlerFixture;

  beforeEach(() => {
    dmlHandlerFixture = new DmlHandlerFixture();
  });

  test('insert two rows', async () => {
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

    const result = await dmlHandlerFixture.insert(TABLE_DEFINITION_NAMES, inputObj);
    expect(result).toEqual(inputObj);
  });
});
