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
});
