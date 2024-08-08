import type fetch from 'node-fetch';

import type { DmlHandler } from '../dml-handler';
import IndexerConfig from '../../indexer-config';
import { LogLevel } from '../../indexer-meta/log-entry';
import ContextBuilder from './context-builder';

describe('ContextBuilder unit tests', () => {
  const MOCK_CONFIG = {
    hasuraEndpoint: 'mock-hasura-endpoint',
    hasuraAdminSecret: 'mock-hasura-secret',
  };

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
      CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
    );`;

  const SOCIAL_SCHEMA = `
    CREATE TABLE
      "posts" (
        "id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "accounts_liked" JSONB NOT NULL DEFAULT '[]',
        "last_comment_timestamp" DECIMAL(20, 0),
        CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "comments" (
        "id" SERIAL NOT NULL,
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "post_likes" (
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0),
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id", "account_id")
      );`;

  const CASE_SENSITIVE_SCHEMA = `
    CREATE TABLE
      Posts (
        "id" SERIAL NOT NULL,
        "AccountId" VARCHAR NOT NULL,
        BlockHeight DECIMAL(58, 0) NOT NULL,
        "receiptId" VARCHAR NOT NULL,
        content TEXT NOT NULL,
        block_Timestamp DECIMAL(20, 0) NOT NULL,
        "Accounts_Liked" JSONB NOT NULL DEFAULT '[]',
        "LastCommentTimestamp" DECIMAL(20, 0),
        CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "CommentsTable" (
        "id" SERIAL NOT NULL,
        PostId SERIAL NOT NULL,
        "accountId" VARCHAR NOT NULL,
        blockHeight DECIMAL(58, 0) NOT NULL,
        CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
      );`;

  const STRESS_TEST_SCHEMA = `
    CREATE TABLE creator_quest (
        account_id VARCHAR PRIMARY KEY,
        num_components_created INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE
      );

    CREATE TABLE
      composer_quest (
        account_id VARCHAR PRIMARY KEY,
        num_widgets_composed INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE
      );

    CREATE TABLE
      "contractor - quest" (
        account_id VARCHAR PRIMARY KEY,
        num_contracts_deployed INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE
      );

    CREATE TABLE
      "posts" (
        "id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "accounts_liked" JSONB NOT NULL DEFAULT '[]',
        "last_comment_timestamp" DECIMAL(20, 0),
        CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "comments" (
        "id" SERIAL NOT NULL,
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0) NOT NULL,
        "content" TEXT NOT NULL,
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
      );

    CREATE TABLE
      "post_likes" (
        "post_id" SERIAL NOT NULL,
        "account_id" VARCHAR NOT NULL,
        "block_height" DECIMAL(58, 0),
        "block_timestamp" DECIMAL(20, 0) NOT NULL,
        "receipt_id" VARCHAR NOT NULL,
        CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id", "account_id")
      );

    CREATE UNIQUE INDEX "posts_account_id_block_height_key" ON "posts" ("account_id" ASC, "block_height" ASC);

    CREATE UNIQUE INDEX "comments_post_id_account_id_block_height_key" ON "comments" (
      "post_id" ASC,
      "account_id" ASC,
      "block_height" ASC
    );

    CREATE INDEX
      "posts_last_comment_timestamp_idx" ON "posts" ("last_comment_timestamp" DESC);

    ALTER TABLE
      "comments"
    ADD
      CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

    ALTER TABLE
      "post_likes"
    ADD
      CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    CREATE TABLE IF NOT EXISTS
      "My Table1" (id serial PRIMARY KEY);

    CREATE TABLE
      "Another-Table" (id serial PRIMARY KEY);

    CREATE TABLE
    IF NOT EXISTS
      "Third-Table" (id serial PRIMARY KEY);

    CREATE TABLE
      yet_another_table (id serial PRIMARY KEY);
    `;

  const SIMPLE_REDIS_STREAM = 'test:stream';
  const SIMPLE_ACCOUNT_ID = 'morgs.near';
  const SIMPLE_FUNCTION_NAME = 'test_indexer';
  const SIMPLE_CODE = 'const a = 1;';
  const SIMPLE_SCHEMA_CONFIG: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, SIMPLE_SCHEMA, LogLevel.INFO);
  const SIMPLE_SOCIAL_CONFIG: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, SOCIAL_SCHEMA, LogLevel.INFO);
  const CASE_SENSITIVE_CONFIG: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, CASE_SENSITIVE_SCHEMA, LogLevel.INFO);
  const STRESS_TEST_CONFIG: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, STRESS_TEST_SCHEMA, LogLevel.INFO);

  const genericMockFetch = jest.fn()
    .mockResolvedValue({
      status: 200,
      json: async () => ({
        data: 'mock',
      }),
    }) as unknown as typeof fetch;

  const genericMockDmlHandler = {
    insert: jest.fn().mockReturnValue([]),
    select: jest.fn().mockReturnValue([]),
    update: jest.fn().mockReturnValue([]),
    upsert: jest.fn().mockReturnValue([]),
    delete: jest.fn().mockReturnValue([]),
  } as unknown as DmlHandler;

  test('ContextBuilder can parse various schemas', () => {
    const simpleContextBuilder = new ContextBuilder(
      SIMPLE_SCHEMA_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: genericMockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );

    const socialContextBuilder = new ContextBuilder(
      SIMPLE_SOCIAL_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: genericMockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );

    const caseSensitiveContextBuilder = new ContextBuilder(
      CASE_SENSITIVE_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: genericMockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );

    const stressTestContextBuilder = new ContextBuilder(
      STRESS_TEST_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: genericMockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );

    expect(simpleContextBuilder.buildContext(1, []).db).toMatchSnapshot();
    expect(socialContextBuilder.buildContext(1, []).db).toMatchSnapshot();
    expect(caseSensitiveContextBuilder.buildContext(1, []).db).toMatchSnapshot();
    expect(stressTestContextBuilder.buildContext(1, []).db).toMatchSnapshot();
  });

  test('ContextBuilder adds CRUD operations for table', () => {
    const contextBuilder = new ContextBuilder(
      SIMPLE_SCHEMA_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: genericMockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );
    const context = contextBuilder.buildContext(1, []);
    context.db.Posts.insert({});
    context.db.Posts.select({});
    context.db.Posts.update({}, {});
    context.db.Posts.upsert({}, [], []);
    context.db.Posts.delete({});

    expect(genericMockDmlHandler.insert).toHaveBeenCalledTimes(1);
    expect(genericMockDmlHandler.select).toHaveBeenCalledTimes(1);
    expect(genericMockDmlHandler.update).toHaveBeenCalledTimes(1);
    expect(genericMockDmlHandler.upsert).toHaveBeenCalledTimes(1);
    expect(genericMockDmlHandler.delete).toHaveBeenCalledTimes(1);
    expect(context.db.Posts).toMatchSnapshot();
  });

  test('Context object has empty db object if schema is empty', async () => {
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, 'code', '', LogLevel.INFO);
    const contextBuilder = new ContextBuilder(
      indexerConfig,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: genericMockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );
    const context = contextBuilder.buildContext(1, []);

    expect(Object.keys(context.db)).toStrictEqual([]);
  });

  test('Context object has empty db object if schema fails to parse', async () => {
    const schemaWithDuplicateSanitizedTableNames = `CREATE TABLE
    "test table" (
      "id" SERIAL NOT NULL
    );
    CREATE TABLE "test!table" (
      "id" SERIAL NOT NULL
    );`;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, 'code', schemaWithDuplicateSanitizedTableNames, LogLevel.INFO);
    const contextBuilder = new ContextBuilder(
      indexerConfig,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: genericMockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );

    // Does not outright throw an error but instead returns an empty object
    expect(contextBuilder.buildDatabaseContext(1, []))
      .toStrictEqual({});
  });

  test('Context object allows execution of arbitrary GraphQL operations', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {
            greet: 'hello'
          }
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {
            newGreeting: {
              success: true
            }
          }
        })
      });
    const contextBuilder = new ContextBuilder(
      SIMPLE_SCHEMA_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: mockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );
    const context = contextBuilder.buildContext(1, []);
    const query = `
            query {
                greet()
            }
        `;
    const { greet } = await context.graphql(query) as { greet: string };

    const mutation = `
            mutation {
                newGreeting(greeting: "${greet} morgan") {
                    success
                }
            }
        `;
    const { newGreeting: { success } } = await context.graphql(mutation);

    expect(greet).toEqual('hello');
    expect(success).toEqual(true);
    expect(mockFetch.mock.calls[0]).toEqual([
      `${MOCK_CONFIG.hasuraEndpoint}/v1/graphql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hasura-Use-Backend-Only-Permissions': 'true',
          'X-Hasura-Role': 'morgs_near',
          'X-Hasura-Admin-Secret': MOCK_CONFIG.hasuraAdminSecret
        },
        body: JSON.stringify({ query })
      }
    ]);
    expect(mockFetch.mock.calls[1]).toEqual([
      `${MOCK_CONFIG.hasuraEndpoint}/v1/graphql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hasura-Use-Backend-Only-Permissions': 'true',
          'X-Hasura-Role': 'morgs_near',
          'X-Hasura-Admin-Secret': MOCK_CONFIG.hasuraAdminSecret
        },
        body: JSON.stringify({ query: mutation })
      }
    ]);
  });

  test('Context object social api can fetch from the near social api', async () => {
    const mockFetch = jest.fn();
    const contextBuilder = new ContextBuilder(
      SIMPLE_SCHEMA_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: mockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );
    const context = contextBuilder.buildContext(1, []);

    await context.fetchFromSocialApi('/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'post',
        key: 'main',
        options: {
          limit: 1,
          order: 'desc'
        }
      })
    });

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('Context object graphql function throws when a GraphQL response contains errors', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValue({
        json: async () => ({
          errors: ['boom']
        })
      });
    const contextBuilder = new ContextBuilder(
      SIMPLE_SCHEMA_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: mockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );
    const context = contextBuilder.buildContext(1, []);

    await expect(async () => await context.graphql('query { hello }')).rejects.toThrow('boom');
  });

  test('Context object graphl handles GraphQL variables and sets backend only permissions', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValue({
        status: 200,
        json: async () => ({
          data: 'mock',
        }),
      });
    const contextBuilder = new ContextBuilder(
      SIMPLE_SCHEMA_CONFIG,
      {
        dmlHandler: genericMockDmlHandler,
        fetch: mockFetch as unknown as typeof fetch,
      },
      MOCK_CONFIG
    );
    const context = contextBuilder.buildContext(1, []);

    const query = 'query($name: String) { hello(name: $name) }';
    const variables = { name: 'morgan' };
    await context.graphql(query, variables);

    expect(mockFetch.mock.calls[0]).toEqual([
      `${MOCK_CONFIG.hasuraEndpoint}/v1/graphql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hasura-Use-Backend-Only-Permissions': 'true',
          'X-Hasura-Role': 'morgs_near',
          'X-Hasura-Admin-Secret': MOCK_CONFIG.hasuraAdminSecret
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      },
    ]);
  });
});
