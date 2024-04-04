import { Block, type StreamerMessage } from '@near-lake/primitives';
import type fetch from 'node-fetch';

import Indexer from './indexer';
import { VM } from 'vm2';
import DmlHandler from '../dml-handler/dml-handler';
import type PgClient from '../pg-client';
import { type IndexerBehavior } from '../stream-handler/stream-handler';
import { LogLevel } from '../indexer-logger/indexer-logger';

describe('Indexer unit tests', () => {
  const HASURA_ROLE = 'morgs_near';
  const INVALID_HASURA_ROLE = 'other_near';

  const INDEXER_NAME = 'morgs.near/test_fn';

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
  const defaultIndexerBehavior: IndexerBehavior = {
    log_level: LogLevel.INFO,
  };

  const genericMockFetch = jest.fn()
    .mockResolvedValue({
      status: 200,
      json: async () => ({
        data: 'mock',
      }),
    });
  const genericMockDmlHandler: any = {
    create: jest.fn()
  } as unknown as DmlHandler;

  const genericDbCredentials: any = {
    database: 'test_near',
    host: 'postgres',
    password: 'test_pass',
    port: 5432,
    username: 'test_near'
  };

  const genericProvisioner: any = {
    getDatabaseConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials)
  };

  const config = {
    hasuraEndpoint: 'mock-hasura-endpoint',
    hasuraAdminSecret: 'mock-hasura-secret',
  };

  test('Indexer.runFunctions() should execute all functions against the current block', async () => {
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const blockHeight = 456;
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;

    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner: genericProvisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions: Record<string, any> = {};
    functions['buildnear.testnet/test'] = {
      code: `
            const foo = 3;
            block.result = context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
        `,
      schema: SIMPLE_SCHEMA
    };
    await indexer.runFunctions(mockBlock, functions, false);

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('Indexer.transformIndexerFunction() applies the necessary transformations', () => {
    const indexer = new Indexer(defaultIndexerBehavior, undefined, undefined, undefined, config);

    const transformedFunction = indexer.transformIndexerFunction('console.log(\'hello\')');

    expect(transformedFunction).toEqual(`
            async function f(){
                console.log('hello')
            };
            f();
    `);
  });

  test('Indexer.buildContext() allows execution of arbitrary GraphQL operations', async () => {
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
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const context = indexer.buildContext(SIMPLE_SCHEMA, INDEXER_NAME, 1, HASURA_ROLE);

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
            `${config.hasuraEndpoint}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': 'morgs_near',
                'X-Hasura-Admin-Secret': config.hasuraAdminSecret
              },
              body: JSON.stringify({ query })
            }
    ]);
    expect(mockFetch.mock.calls[1]).toEqual([
            `${config.hasuraEndpoint}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': 'morgs_near',
                'X-Hasura-Admin-Secret': config.hasuraAdminSecret
              },
              body: JSON.stringify({ query: mutation })
            }
    ]);
  });

  test('Indexer.buildContext() can fetch from the near social api', async () => {
    const mockFetch = jest.fn();
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const context = indexer.buildContext(SIMPLE_SCHEMA, INDEXER_NAME, 1, HASURA_ROLE);

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

  test('Indexer.buildContext() throws when a GraphQL response contains errors', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValue({
        json: async () => ({
          errors: ['boom']
        })
      });
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const context = indexer.buildContext(SIMPLE_SCHEMA, INDEXER_NAME, 1, INVALID_HASURA_ROLE);

    await expect(async () => await context.graphql('query { hello }')).rejects.toThrow('boom');
  });

  test('Indexer.buildContext() handles GraphQL variables', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValue({
        status: 200,
        json: async () => ({
          data: 'mock',
        }),
      });
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const context = indexer.buildContext(SIMPLE_SCHEMA, INDEXER_NAME, 1, HASURA_ROLE);

    const query = 'query($name: String) { hello(name: $name) }';
    const variables = { name: 'morgan' };
    await context.graphql(query, variables);

    expect(mockFetch.mock.calls[0]).toEqual([
            `${config.hasuraEndpoint}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': 'morgs_near',
                'X-Hasura-Admin-Secret': config.hasuraAdminSecret
              },
              body: JSON.stringify({
                query,
                variables,
              }),
            },
    ]);
  });

  test('GetTableNameToDefinitionNamesMapping works for a variety of input schemas', async () => {
    const indexer = new Indexer(defaultIndexerBehavior);

    const tableNameToDefinitionNamesMapping = indexer.getTableNameToDefinitionNamesMapping(STRESS_TEST_SCHEMA);
    expect([...tableNameToDefinitionNamesMapping.keys()]).toStrictEqual([
      'creator_quest',
      'composer_quest',
      'contractor - quest',
      'posts',
      'comments',
      'post_likes',
      'My Table1',
      'Another-Table',
      'Third-Table',
      'yet_another_table']);

    // Test that duplicate table names throw an error
    const duplicateTableSchema = `CREATE TABLE
    "posts" (
      "id" SERIAL NOT NULL
    );
    CREATE TABLE posts (
      "id" SERIAL NOT NULL
    );`;
    expect(() => {
      indexer.getTableNameToDefinitionNamesMapping(duplicateTableSchema);
    }).toThrow('Table posts already exists in schema. Table names must be unique. Quotes are not allowed as a differentiator between table names.');

    // Test that schema with no tables throws an error
    expect(() => {
      indexer.getTableNameToDefinitionNamesMapping('');
    }).toThrow('Schema does not have any tables. There should be at least one table.');
  });

  test('GetTableNameToDefinitionNamesMapping works for mixed quotes schema', async () => {
    const indexer = new Indexer(defaultIndexerBehavior);

    const tableNameToDefinitionNamesMapping = indexer.getTableNameToDefinitionNamesMapping(CASE_SENSITIVE_SCHEMA);
    const tableNames = [...tableNameToDefinitionNamesMapping.keys()];
    const originalTableNames = tableNames.map((tableName) => tableNameToDefinitionNamesMapping.get(tableName)?.originalTableName);
    expect(tableNames).toStrictEqual(['Posts', 'CommentsTable']);
    expect(originalTableNames).toStrictEqual(['Posts', '"CommentsTable"']);

    // Spot check quoting for columnNames
    const postsColumnNames = tableNameToDefinitionNamesMapping.get('Posts')?.originalColumnNames;
    const commentsColumnNames = tableNameToDefinitionNamesMapping.get('CommentsTable')?.originalColumnNames;
    expect(postsColumnNames?.get('id')).toStrictEqual('"id"');
    expect(postsColumnNames?.get('AccountId')).toStrictEqual('"AccountId"');
    expect(postsColumnNames?.get('BlockHeight')).toStrictEqual('BlockHeight');
    expect(commentsColumnNames?.get('accountId')).toStrictEqual('"accountId"');
    expect(commentsColumnNames?.get('blockHeight')).toStrictEqual('blockHeight');
  });

  test('GetSchemaLookup works for mixed quotes schema', async () => {
    const indexer = new Indexer(defaultIndexerBehavior);

    const schemaLookup = indexer.getTableNameToDefinitionNamesMapping(CASE_SENSITIVE_SCHEMA);
    const tableNames = [...schemaLookup.keys()];
    const originalTableNames = tableNames.map((tableName) => schemaLookup.get(tableName)?.originalTableName);
    expect(tableNames).toStrictEqual(['Posts', 'CommentsTable']);
    expect(originalTableNames).toStrictEqual(['Posts', '"CommentsTable"']);

    // Spot check quoting for columnNames
    expect(schemaLookup.get('Posts')?.originalColumnNames.get('id')).toStrictEqual('"id"');
    expect(schemaLookup.get('Posts')?.originalColumnNames.get('AccountId')).toStrictEqual('"AccountId"');
    expect(schemaLookup.get('Posts')?.originalColumnNames.get('BlockHeight')).toStrictEqual('BlockHeight');
    expect(schemaLookup.get('CommentsTable')?.originalColumnNames.get('accountId')).toStrictEqual('"accountId"');
    expect(schemaLookup.get('CommentsTable')?.originalColumnNames.get('blockHeight')).toStrictEqual('blockHeight');
  });

  test('SanitizeTableName works properly on many test cases', async () => {
    const indexer = new Indexer(defaultIndexerBehavior, undefined, undefined, undefined, config);

    expect(indexer.sanitizeTableName('table_name')).toStrictEqual('TableName');
    expect(indexer.sanitizeTableName('tablename')).toStrictEqual('Tablename'); // name is not capitalized
    expect(indexer.sanitizeTableName('table name')).toStrictEqual('TableName');
    expect(indexer.sanitizeTableName('table!name!')).toStrictEqual('TableName');
    expect(indexer.sanitizeTableName('123TABle')).toStrictEqual('_123TABle'); // underscore at beginning
    expect(indexer.sanitizeTableName('123_tABLE')).toStrictEqual('_123TABLE'); // underscore at beginning, capitalization
    expect(indexer.sanitizeTableName('some-table_name')).toStrictEqual('SomeTableName');
    expect(indexer.sanitizeTableName('!@#$%^&*()table@)*&(%#')).toStrictEqual('Table'); // All special characters removed
    expect(indexer.sanitizeTableName('T_name')).toStrictEqual('TName');
    expect(indexer.sanitizeTableName('_table')).toStrictEqual('Table'); // Starting underscore was removed
  });

  test('indexer fails to build context.db due to collision on sanitized table names', async () => {
    const indexer = new Indexer(defaultIndexerBehavior, { DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const schemaWithDuplicateSanitizedTableNames = `CREATE TABLE
    "test table" (
      "id" SERIAL NOT NULL
    );
    CREATE TABLE "test!table" (
      "id" SERIAL NOT NULL
    );`;

    // Does not outright throw an error but instead returns an empty object
    expect(indexer.buildDatabaseContext('test_account', 'test_schema_name', schemaWithDuplicateSanitizedTableNames, 1))
      .toStrictEqual({});
  });

  test('indexer builds context and inserts an objects into existing table', async () => {
    const mockDmlHandlerInstance: any = { insert: jest.fn().mockReturnValue([{ colA: 'valA' }, { colA: 'valA' }]) };
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return mockDmlHandlerInstance;
      })
    };

    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, mockDmlHandlerInstance, config);
    const context = indexer.buildContext(SOCIAL_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');

    const objToInsert = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: 'test',
      block_timestamp: 800,
      accounts_liked: JSON.stringify(['cwpuzzles.near', 'devbose.near'])
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: 'test',
      block_timestamp: 801,
      accounts_liked: JSON.stringify(['cwpuzzles.near'])
    }];

    const result = await context.db.Posts.insert(objToInsert);
    expect(result.length).toEqual(2);
  });

  test('indexer builds context and does simultaneous upserts', async () => {
    const mockPgClient = {
      query: jest.fn().mockReturnValue({ rows: [] }),
      format: jest.fn().mockReturnValue('mock')
    } as unknown as PgClient;
    const dmlHandlerInstance: any = DmlHandler.create(genericDbCredentials, mockPgClient);
    const upsertSpy = jest.spyOn(dmlHandlerInstance, 'upsert');
    const mockDmlHandler: any = {
      create: jest.fn().mockReturnValue(dmlHandlerInstance)
    };
    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, dmlHandlerInstance, config);
    const context = indexer.buildContext(SOCIAL_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');
    const promises = [];

    for (let i = 1; i <= 100; i++) {
      const promise = context.db.Posts.upsert(
        {
          account_id: 'morgs_near',
          block_height: i,
          receipt_id: 'abc',
          content: 'test_content',
          block_timestamp: 800,
          accounts_liked: JSON.stringify(['cwpuzzles.near', 'devbose.near'])
        },
        ['account_id', 'block_height'],
        ['content', 'block_timestamp']
      );
      promises.push(promise);
    }
    await Promise.all(promises);

    expect(upsertSpy).toHaveBeenCalledTimes(100);
  });

  test('indexer builds context and selects objects from existing table', async () => {
    const selectFn = jest.fn();
    selectFn.mockImplementation((...args) => {
      // Expects limit to be last parameter
      return args[args.length - 1] === null ? [{ colA: 'valA' }, { colA: 'valA' }] : [{ colA: 'valA' }];
    });
    const mockDmlHandlerInstance: any = { select: selectFn };
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return mockDmlHandlerInstance;
      })
    };

    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, mockDmlHandlerInstance, config);
    const context = indexer.buildContext(SOCIAL_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');

    const objToSelect = {
      account_id: 'morgs_near',
      receipt_id: 'abc',
    };
    const result = await context.db.Posts.select(objToSelect);
    expect(result.length).toEqual(2);
    const resultLimit = await context.db.Posts.select(objToSelect, 1);
    expect(resultLimit.length).toEqual(1);
  });

  test('indexer builds context and updates multiple objects from existing table', async () => {
    const mockDmlHandlerInstance: any = {
      update: jest.fn().mockImplementation((_, __, whereObj, updateObj) => {
        if (whereObj.account_id === 'morgs_near' && updateObj.content === 'test_content') {
          return [{ colA: 'valA' }, { colA: 'valA' }];
        }
        return [{}];
      })
    };
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return mockDmlHandlerInstance;
      })
    };

    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, mockDmlHandlerInstance, config);
    const context = indexer.buildContext(SOCIAL_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');

    const whereObj = {
      account_id: 'morgs_near',
      receipt_id: 'abc',
    };
    const updateObj = {
      content: 'test_content',
      block_timestamp: 805,
    };
    const result = await context.db.Posts.update(whereObj, updateObj);
    expect(result.length).toEqual(2);
  });

  test('indexer builds context and upserts on existing table', async () => {
    const mockDmlHandlerInstance: any = {
      upsert: jest.fn().mockImplementation((_, __, objects, conflict, update) => {
        if (objects.length === 2 && conflict.includes('account_id') && update.includes('content')) {
          return [{ colA: 'valA' }, { colA: 'valA' }];
        } else if (objects.length === 1 && conflict.includes('account_id') && update.includes('content')) {
          return [{ colA: 'valA' }];
        }
        return [{}];
      })
    };
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return mockDmlHandlerInstance;
      })
    };

    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, mockDmlHandlerInstance, config);
    const context = indexer.buildContext(SOCIAL_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');

    const objToInsert = [{
      account_id: 'morgs_near',
      block_height: 1,
      receipt_id: 'abc',
      content: 'test',
      block_timestamp: 800,
      accounts_liked: JSON.stringify(['cwpuzzles.near', 'devbose.near'])
    },
    {
      account_id: 'morgs_near',
      block_height: 2,
      receipt_id: 'abc',
      content: 'test',
      block_timestamp: 801,
      accounts_liked: JSON.stringify(['cwpuzzles.near'])
    }];

    let result = await context.db.Posts.upsert(objToInsert, ['account_id', 'block_height'], ['content', 'block_timestamp']);
    expect(result.length).toEqual(2);
    result = await context.db.Posts.upsert(objToInsert[0], ['account_id', 'block_height'], ['content', 'block_timestamp']);
    expect(result.length).toEqual(1);
  });

  test('indexer builds context and deletes objects from existing table', async () => {
    const mockDmlHandlerInstance: any = { delete: jest.fn().mockReturnValue([{ colA: 'valA' }, { colA: 'valA' }]) };
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return mockDmlHandlerInstance;
      })
    };

    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, mockDmlHandlerInstance, config);
    const context = indexer.buildContext(SOCIAL_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');

    const deleteFilter = {
      account_id: 'morgs_near',
      receipt_id: 'abc',
    };
    const result = await context.db.Posts.delete(deleteFilter);
    expect(result.length).toEqual(2);
  });

  test('indexer builds context and verifies all methods generated', async () => {
    const mockDmlHandler: any = {
      create: jest.fn()
    };

    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, undefined, config);
    const context = indexer.buildContext(STRESS_TEST_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');

    expect(Object.keys(context.db)).toStrictEqual([
      'CreatorQuest',
      'ComposerQuest',
      'ContractorQuest',
      'Posts',
      'Comments',
      'PostLikes',
      'MyTable1',
      'AnotherTable',
      'ThirdTable',
      'YetAnotherTable']);
    expect(Object.keys(context.db.CreatorQuest)).toStrictEqual([
      'insert',
      'select',
      'update',
      'upsert',
      'delete']);
    expect(Object.keys(context.db.PostLikes)).toStrictEqual([
      'insert',
      'select',
      'update',
      'upsert',
      'delete']);
    expect(Object.keys(context.db.MyTable1)).toStrictEqual([
      'insert',
      'select',
      'update',
      'upsert',
      'delete']);
  });

  test('indexer builds context and returns empty array if failed to generate db methods', async () => {
    const mockDmlHandler: any = {
      create: jest.fn()
    };

    const indexer = new Indexer(defaultIndexerBehavior, {
      fetch: genericMockFetch as unknown as typeof fetch,
      DmlHandler: mockDmlHandler
    }, genericDbCredentials, undefined, config);
    const context = indexer.buildContext('', 'morgs.near/social_feed1', 1, 'postgres');

    expect(Object.keys(context.db)).toStrictEqual([]);
  });

  test('Indexer.runFunctions() allows imperative execution of GraphQL operations', async () => {
    const postId = 1;
    const commentId = 2;
    const blockHeight = 82699904;
    const mockFetch = jest.fn()
      .mockReturnValueOnce({ // starting log
        status: 200,
        json: async () => ({
          data: {
            indexer_log_store: [
              {
                id: '12345',
              },
            ],
          },
        }),
      })
      .mockReturnValueOnce({
        status: 200,
        json: async () => ({
          errors: null,
        }),
      })
      .mockReturnValueOnce({ // query
        status: 200,
        json: async () => ({
          data: {
            posts: [
              {
                id: postId,
              },
            ],
          },
        }),
      })
      .mockReturnValueOnce({ // mutation
        status: 200,
        json: async () => ({
          data: {
            insert_comments: {
              returning: {
                id: commentId,
              },
            },
          },
        }),
      })
      .mockReturnValueOnce({
        status: 200,
        json: async () => ({
          errors: null,
        }),
      });

    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner: genericProvisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions: Record<string, any> = {};
    functions['buildnear.testnet/test'] = {
      code: `
            const { posts } = await context.graphql(\`
                query {
                    posts(where: { id: { _eq: 1 } }) {
                        id
                    }
                }
            \`);

            if (!posts || posts.length === 0) {
                return;
            }

            const [post] = posts;

            const { insert_comments: { returning: { id } } } = await context.graphql(\`
                mutation {
                    insert_comments(
                        objects: {account_id: "morgs.near", block_height: \${block.blockHeight}, content: "cool post", post_id: \${post.id}}
                    ) {
                        returning {
                            id
                        }
                    }
                }
            \`);

            return (\`Created comment \${id} on post \${post.id}\`)
        `,
      schema: SIMPLE_SCHEMA
    };

    await indexer.runFunctions(mockBlock, functions, false);

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('Indexer.runFunctions() console.logs', async () => {
    const logs: string[] = [];
    const context = {
      log: (...m: string[]) => {
        logs.push(...m);
      }
    };
    const vm = new VM();
    vm.freeze(context, 'context');
    vm.freeze(context, 'console');
    await vm.run('console.log("hello", "brave new"); context.log("world")');
    expect(logs).toEqual(['hello', 'brave new', 'world']);
  });

  test('Errors thrown in VM can be caught outside the VM', async () => {
    const vm = new VM();
    expect(() => {
      vm.run("throw new Error('boom')");
    }).toThrow('boom');
  });

  test('Indexer.runFunctions() catches errors', async () => {
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const blockHeight = 456;
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner: genericProvisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions: Record<string, any> = {};
    functions['buildnear.testnet/test'] = {
      code: `
            throw new Error('boom');
        `,
      schema: SIMPLE_SCHEMA
    };

    await expect(indexer.runFunctions(mockBlock, functions, false)).rejects.toThrow(new Error('boom'));
    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('Indexer.runFunctions() provisions a GraphQL endpoint with the specified schema', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const provisioner: any = {
      getDatabaseConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(false),
      provisionUserApi: jest.fn(),
    };
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions = {
      'morgs.near/test': {
        account_id: 'morgs.near',
        function_name: 'test',
        code: '',
        schema: SIMPLE_SCHEMA,
      }
    };
    await indexer.runFunctions(mockBlock, functions, false, { provision: true });

    expect(provisioner.fetchUserApiProvisioningStatus).toHaveBeenCalledWith('morgs.near', 'test');
    expect(provisioner.provisionUserApi).toHaveBeenCalledTimes(1);
    expect(provisioner.provisionUserApi).toHaveBeenCalledWith(
      'morgs.near',
      'test',
      SIMPLE_SCHEMA
    );
    expect(provisioner.getDatabaseConnectionParameters).toHaveBeenCalledTimes(1);
  });

  test('Indexer.runFunctions() skips provisioning if the endpoint exists', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const provisioner: any = {
      getDatabaseConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
    };
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions: Record<string, any> = {
      'morgs.near/test': {
        code: '',
        schema: SIMPLE_SCHEMA,
      }
    };
    await indexer.runFunctions(mockBlock, functions, false, { provision: true });

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    expect(provisioner.getDatabaseConnectionParameters).toHaveBeenCalledTimes(1);
  });

  test('Indexer.runFunctions() skips database credentials fetch second time onward', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const provisioner: any = {
      getDatabaseConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
    };
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions: Record<string, any> = {
      'morgs.near/test': {
        code: '',
        schema: SIMPLE_SCHEMA,
      }
    };
    await indexer.runFunctions(mockBlock, functions, false, { provision: true });
    await indexer.runFunctions(mockBlock, functions, false, { provision: true });
    await indexer.runFunctions(mockBlock, functions, false, { provision: true });

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    expect(provisioner.getDatabaseConnectionParameters).toHaveBeenCalledTimes(1);
  });

  test('Indexer.runFunctions() supplies the required role to the GraphQL endpoint', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const provisioner: any = {
      getDatabaseConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
    };
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions: Record<string, any> = {
      'morgs.near/test': {
        code: `
                    context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
                `,
        schema: SIMPLE_SCHEMA,
      }
    };
    await indexer.runFunctions(mockBlock, functions, false, { provision: true });

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    expect(mockFetch.mock.calls).toMatchSnapshot();
    expect(provisioner.getDatabaseConnectionParameters).toHaveBeenCalledTimes(1);
  });

  test('Indexer.runFunctions() logs provisioning failures', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const error = new Error('something went wrong with provisioning');
    const provisioner: any = {
      getDatabaseConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(false),
      provisionUserApi: jest.fn().mockRejectedValue(error),
    };
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, provisioner, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);

    const functions: Record<string, any> = {
      'morgs.near/test': {
        code: `
                    context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
                `,
        schema: 'schema',
      }
    };

    await expect(indexer.runFunctions(mockBlock, functions, false, { provision: true })).rejects.toThrow(error);
    expect(mockFetch.mock.calls).toMatchSnapshot();
    expect(provisioner.getDatabaseConnectionParameters).not.toHaveBeenCalled();
  });

  test('Indexer log level respected by writeLog', async () => {
    const mockFetchDebug = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockFetchInfo = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockFetchError = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const blockHeight = 456;
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const functions: Record<string, any> = {};
    functions['buildnear.testnet/test'] = {
      code: `
            console.debug('debug log');
            console.log('info log');
            console.error('error log');
            await context.db.Posts.select({
              account_id: 'morgs_near',
              receipt_id: 'abc',
            });
        `,
      schema: SIMPLE_SCHEMA
    };
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return { select: jest.fn() };
      })
    };

    const indexerDebug = new Indexer(
      { log_level: LogLevel.DEBUG },
      { fetch: mockFetchDebug as unknown as typeof fetch, provisioner: genericProvisioner, DmlHandler: mockDmlHandler },
      undefined,
      undefined,
      config
    );
    const indexerInfo = new Indexer(
      { log_level: LogLevel.INFO },
      { fetch: mockFetchInfo as unknown as typeof fetch, provisioner: genericProvisioner, DmlHandler: mockDmlHandler },
      undefined,
      undefined,
      config
    );
    const indexerError = new Indexer(
      { log_level: LogLevel.ERROR },
      { fetch: mockFetchError as unknown as typeof fetch, provisioner: genericProvisioner, DmlHandler: mockDmlHandler },
      undefined,
      undefined,
      config
    );

    await indexerDebug.runFunctions(mockBlock, functions, false);
    await indexerInfo.runFunctions(mockBlock, functions, false);
    await indexerError.runFunctions(mockBlock, functions, false);

    // There are 1 set status (no log level), 1 run function log (info level), and 1 set function state (no log level) made each run
    expect(mockFetchDebug.mock.calls).toMatchSnapshot();
    expect(mockFetchDebug).toHaveBeenCalledTimes(7); // 4 logs + 3 graphql calls

    expect(mockFetchInfo.mock.calls).toMatchSnapshot();
    expect(mockFetchInfo).toHaveBeenCalledTimes(5); // 2 logs + 2 graphql call

    expect(mockFetchError.mock.calls).toMatchSnapshot();
    expect(mockFetchError).toHaveBeenCalledTimes(3); // 1 log + 2 graphql call
  });

  test('does not attach the hasura admin secret header when no role specified', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {}
        })
      });
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);
    // @ts-expect-error legacy test
    const context = indexer.buildContext(SIMPLE_SCHEMA, INDEXER_NAME, 1, null);

    const mutation = `
            mutation {
                newGreeting(greeting: "howdy") {
                    success
                }
            }
        `;

    await context.graphql(mutation);

    expect(mockFetch.mock.calls[0]).toEqual([
            `${config.hasuraEndpoint}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
              },
              body: JSON.stringify({ query: mutation })
            }
    ]);
  });

  test('attaches the backend only header to requests to hasura', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {}
        })
      });
    const role = 'morgs_near';
    const indexer = new Indexer(defaultIndexerBehavior, { fetch: mockFetch as unknown as typeof fetch, DmlHandler: genericMockDmlHandler }, undefined, undefined, config);
    const context = indexer.buildContext(SIMPLE_SCHEMA, INDEXER_NAME, 1, HASURA_ROLE);

    const mutation = `
            mutation {
                newGreeting(greeting: "howdy") {
                    success
                }
            }
        `;

    await context.graphql(mutation);

    expect(mockFetch.mock.calls[0]).toEqual([
            `${config.hasuraEndpoint}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': role,
                'X-Hasura-Admin-Secret': config.hasuraAdminSecret
              },
              body: JSON.stringify({ query: mutation })
            }
    ]);
  });
});