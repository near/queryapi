import { Block, type StreamerMessage } from '@near-lake/primitives';
import type fetch from 'node-fetch';

import Indexer from './indexer';
import { VM } from 'vm2';
import DmlHandler from '../dml-handler/dml-handler';
import type PgClient from '../pg-client';
import { LogLevel } from '../indexer-meta/log-entry';
import IndexerConfig from '../indexer-config/indexer-config';
import type IndexerMeta from '../indexer-meta';
import { IndexerStatus } from '../indexer-meta';
import type Provisioner from '../provisioner';
import { type PostgresConnectionParams } from '../pg-client';

describe('Indexer unit tests', () => {
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

  const simpleSchemaConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, SIMPLE_SCHEMA, LogLevel.INFO);
  const socialSchemaConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, SOCIAL_SCHEMA, LogLevel.INFO);
  const caseSensitiveConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, CASE_SENSITIVE_SCHEMA, LogLevel.INFO);
  const stressTestConfig: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, STRESS_TEST_SCHEMA, LogLevel.INFO);

  const genericDbCredentials: PostgresConnectionParams = {
    database: 'test_near',
    host: 'postgres',
    password: 'test_pass',
    port: 5432,
    user: 'test_near'
  };

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

  const genericMockIndexerMeta: any = {
    writeLogs: jest.fn(),
    setStatus: jest.fn(),
    updateBlockHeight: jest.fn()
  } as unknown as IndexerMeta;

  const genericProvisioner = {
    getPgBouncerConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
    fetchUserApiProvisioningStatus: jest.fn().mockResolvedValue(true),
    provisionLogsAndMetadataIfNeeded: jest.fn(),
    ensureConsistentHasuraState: jest.fn(),
  } as unknown as Provisioner;

  const config = {
    hasuraEndpoint: 'mock-hasura-endpoint',
    hasuraAdminSecret: 'mock-hasura-secret',
  };

  test('Indexer.execute() should execute all functions against the current block', async () => {
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

    const code = `
      const foo = 3;
      block.result = context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
    `;
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    } as unknown as IndexerMeta;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner: genericProvisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta,
    }, undefined, config);

    await indexer.execute(mockBlock);

    expect(mockFetch.mock.calls).toMatchSnapshot();
    expect(indexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(indexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);
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
    const indexer = new Indexer(simpleSchemaConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      dmlHandler: genericMockDmlHandler
    }, undefined, config);

    const context = indexer.buildContext(1, []);

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
    const indexer = new Indexer(simpleSchemaConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      dmlHandler: genericMockDmlHandler
    }, undefined, config);

    const context = indexer.buildContext(1, []);

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
    const indexer = new Indexer(simpleSchemaConfig, { fetch: mockFetch as unknown as typeof fetch, dmlHandler: genericMockDmlHandler }, undefined, config);

    const context = indexer.buildContext(1, []);

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
    const indexer = new Indexer(simpleSchemaConfig, { fetch: mockFetch as unknown as typeof fetch, dmlHandler: genericMockDmlHandler }, undefined, config);

    const context = indexer.buildContext(1, []);

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
    const indexer = new Indexer(stressTestConfig);

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
    const indexer = new Indexer(caseSensitiveConfig);

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
    const indexer = new Indexer(caseSensitiveConfig);

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
    const indexer = new Indexer(simpleSchemaConfig, undefined, undefined, config);

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
    const schemaWithDuplicateSanitizedTableNames = `CREATE TABLE
    "test table" (
      "id" SERIAL NOT NULL
    );
    CREATE TABLE "test!table" (
      "id" SERIAL NOT NULL
    );`;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, 'code', schemaWithDuplicateSanitizedTableNames, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, { dmlHandler: genericMockDmlHandler }, undefined, config);

    // Does not outright throw an error but instead returns an empty object
    expect(indexer.buildDatabaseContext(1, []))
      .toStrictEqual({});
  });

  test('indexer builds context and inserts an objects into existing table', async () => {
    const mockDmlHandler: any = { insert: jest.fn().mockReturnValue([{ colA: 'valA' }, { colA: 'valA' }]) };

    const indexer = new Indexer(socialSchemaConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: mockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);

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
    const mockDmlHandler: any = new DmlHandler(genericDbCredentials, mockPgClient);
    const upsertSpy = jest.spyOn(mockDmlHandler, 'upsert');
    const indexer = new Indexer(socialSchemaConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: mockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);
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
    const mockDmlHandler: any = { select: selectFn };

    const indexer = new Indexer(socialSchemaConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: mockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);

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
    const mockDmlHandler: any = {
      update: jest.fn().mockImplementation((_, __, whereObj, updateObj) => {
        if (whereObj.account_id === 'morgs_near' && updateObj.content === 'test_content') {
          return [{ colA: 'valA' }, { colA: 'valA' }];
        }
        return [{}];
      })
    };

    const indexer = new Indexer(socialSchemaConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: mockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);

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
    const mockDmlHandler: any = {
      upsert: jest.fn().mockImplementation((_, __, objects, conflict, update) => {
        if (objects.length === 2 && conflict.includes('account_id') && update.includes('content')) {
          return [{ colA: 'valA' }, { colA: 'valA' }];
        } else if (objects.length === 1 && conflict.includes('account_id') && update.includes('content')) {
          return [{ colA: 'valA' }];
        }
        return [{}];
      })
    };

    const indexer = new Indexer(socialSchemaConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: mockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);

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
    const mockDmlHandler: any = { delete: jest.fn().mockReturnValue([{ colA: 'valA' }, { colA: 'valA' }]) };

    const indexer = new Indexer(socialSchemaConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: mockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);

    const deleteFilter = {
      account_id: 'morgs_near',
      receipt_id: 'abc',
    };
    const result = await context.db.Posts.delete(deleteFilter);
    expect(result.length).toEqual(2);
  });

  test('indexer builds context and verifies all methods generated', async () => {
    const indexer = new Indexer(stressTestConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: genericMockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);

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
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, 'code', '', LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      fetch: genericMockFetch as unknown as typeof fetch,
      dmlHandler: genericMockDmlHandler
    }, genericDbCredentials, config);
    const context = indexer.buildContext(1, []);

    expect(Object.keys(context.db)).toStrictEqual([]);
  });

  test('Indexer.execute() allows imperative execution of GraphQL operations', async () => {
    const postId = 1;
    const commentId = 2;
    const blockHeight = 82699904;
    const mockFetch = jest.fn()
      .mockReturnValueOnce({ // "running function on ..." log
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
      .mockReturnValueOnce({ // set status
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

    const code = `
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
    `;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner: genericProvisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta: genericMockIndexerMeta
    }, undefined, config);

    await indexer.execute(mockBlock);

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('Indexer.execute() console.logs', async () => {
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

  test('Indexer.execute() catches errors', async () => {
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
    const code = `
        throw new Error('boom');
    `;
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    } as unknown as IndexerMeta;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner: genericProvisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta,
    }, undefined, config);

    await expect(indexer.execute(mockBlock)).rejects.toThrow(new Error('Execution error: boom'));
    expect(mockFetch.mock.calls).toMatchSnapshot();
    expect(indexerMeta.setStatus).toHaveBeenNthCalledWith(1, IndexerStatus.RUNNING);
    expect(indexerMeta.setStatus).toHaveBeenNthCalledWith(2, IndexerStatus.FAILING);
    expect(indexerMeta.updateBlockHeight).not.toHaveBeenCalled();
  });

  test('Indexer.execute() provisions a GraphQL endpoint with the specified schema', async () => {
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
      getPgBouncerConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(false),
      provisionUserApi: jest.fn(),
      provisionLogsAndMetadataIfNeeded: jest.fn(),
      ensureConsistentHasuraState: jest.fn(),
    };
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    } as unknown as IndexerMeta;
    const indexer = new Indexer(simpleSchemaConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta,
    }, undefined, config);

    await indexer.execute(mockBlock);

    expect(provisioner.fetchUserApiProvisioningStatus).toHaveBeenCalledWith(simpleSchemaConfig);
    expect(indexerMeta.setStatus).toHaveBeenNthCalledWith(2, IndexerStatus.RUNNING);
    expect(provisioner.provisionUserApi).toHaveBeenCalledTimes(1);
    expect(provisioner.provisionUserApi).toHaveBeenCalledWith(simpleSchemaConfig);
    expect(provisioner.provisionLogsAndMetadataIfNeeded).toHaveBeenCalledTimes(1);
    expect(provisioner.ensureConsistentHasuraState).toHaveBeenCalledTimes(1);
    expect(provisioner.getPgBouncerConnectionParameters).toHaveBeenCalledTimes(1);
  });

  test('Indexer.execute() skips provisioning if the endpoint exists', async () => {
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
      getPgBouncerConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
      provisionLogsAndMetadataIfNeeded: jest.fn(),
      ensureConsistentHasuraState: jest.fn(),
    };
    const indexer = new Indexer(simpleSchemaConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta: genericMockIndexerMeta,
    }, undefined, config);

    await indexer.execute(mockBlock);

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    expect(provisioner.getPgBouncerConnectionParameters).toHaveBeenCalledTimes(1);
    expect(provisioner.provisionLogsAndMetadataIfNeeded).toHaveBeenCalledTimes(1);
    expect(provisioner.ensureConsistentHasuraState).toHaveBeenCalledTimes(1);
  });

  test('Indexer.execute() skips database credentials fetch second time onward', async () => {
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
      getPgBouncerConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
      provisionLogsAndMetadataIfNeeded: jest.fn(),
      ensureConsistentHasuraState: jest.fn(),
    };
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    } as unknown as IndexerMeta;
    const indexer = new Indexer(simpleSchemaConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta,
    }, undefined, config);

    await indexer.execute(mockBlock);
    await indexer.execute(mockBlock);
    await indexer.execute(mockBlock);

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    expect(provisioner.getPgBouncerConnectionParameters).toHaveBeenCalledTimes(1);
    expect(provisioner.provisionLogsAndMetadataIfNeeded).toHaveBeenCalled();
    expect(provisioner.ensureConsistentHasuraState).toHaveBeenCalled();
    expect(indexerMeta.setStatus).toHaveBeenCalledTimes(1); // Status is cached, so only called once
    expect(indexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(indexerMeta.updateBlockHeight).toHaveBeenCalledTimes(3);
    expect(indexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);
  });

  test('Indexer.execute() supplies the required role to the GraphQL endpoint', async () => {
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
      getPgBouncerConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
      provisionLogsAndMetadataIfNeeded: jest.fn(),
      ensureConsistentHasuraState: jest.fn(),
    };
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    } as unknown as IndexerMeta;
    const code = `
      context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
    `;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'morgs.near', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta,
    }, undefined, config);

    await indexer.execute(mockBlock);

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    expect(indexerMeta.setStatus).toHaveBeenNthCalledWith(1, IndexerStatus.RUNNING);
    expect(mockFetch.mock.calls).toMatchSnapshot();
    expect(provisioner.getPgBouncerConnectionParameters).toHaveBeenCalledTimes(1);
    expect(provisioner.provisionLogsAndMetadataIfNeeded).toHaveBeenCalledTimes(1);
    expect(provisioner.ensureConsistentHasuraState).toHaveBeenCalledTimes(1);
    expect(indexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);
  });

  test('Indexer.execute() logs provisioning failures', async () => {
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
      getPgBouncerConnectionParameters: jest.fn().mockReturnValue(genericDbCredentials),
      fetchUserApiProvisioningStatus: jest.fn().mockReturnValue(false),
      provisionUserApi: jest.fn().mockRejectedValue(error),
      provisionLogsIfNeeded: jest.fn(),
      provisionMetadataIfNeeded: jest.fn(),
      ensureConsistentHasuraState: jest.fn(),
    };
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    } as unknown as IndexerMeta;
    const code = `
      context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
    `;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'morgs.near', 'test', 0, code, 'schema', LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      fetch: mockFetch as unknown as typeof fetch,
      provisioner,
      dmlHandler: genericMockDmlHandler,
      indexerMeta,
    }, undefined, config);

    await expect(indexer.execute(mockBlock)).rejects.toThrow(error);

    expect(mockFetch.mock.calls).toMatchSnapshot();
    expect(indexerMeta.updateBlockHeight).not.toHaveBeenCalled();
    expect(provisioner.provisionLogsIfNeeded).not.toHaveBeenCalled();
    expect(provisioner.provisionMetadataIfNeeded).not.toHaveBeenCalled();
    expect(provisioner.getPgBouncerConnectionParameters).not.toHaveBeenCalled();
  });

  test('Indexer passes all relevant logs to writeLogs', async () => {
    const mockDebugIndexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    };
    const mockInfoIndexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    };
    const mockErrorIndexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn()
    };
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

    const code = `
      console.debug('debug log');
      console.log('info log');
      console.error('error log');
      await context.db.Posts.select({
        account_id: 'morgs_near',
        receipt_id: 'abc',
      });
    `;
    const debugIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.DEBUG);
    const infoIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const errorIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.ERROR);
    const mockDmlHandler: DmlHandler = { select: jest.fn() } as unknown as DmlHandler;

    const indexerDebug = new Indexer(
      debugIndexerConfig,
      {
        fetch: jest.fn() as unknown as typeof fetch,
        provisioner: genericProvisioner,
        dmlHandler: mockDmlHandler,
        indexerMeta: mockDebugIndexerMeta as unknown as IndexerMeta
      },
      undefined,
      config
    );
    const indexerInfo = new Indexer(
      infoIndexerConfig,
      {
        fetch: jest.fn() as unknown as typeof fetch,
        provisioner: genericProvisioner,
        dmlHandler: mockDmlHandler,
        indexerMeta: mockInfoIndexerMeta as unknown as IndexerMeta
      },
      undefined,
      config
    );
    const indexerError = new Indexer(
      errorIndexerConfig,
      {
        fetch: jest.fn() as unknown as typeof fetch,
        provisioner: genericProvisioner,
        dmlHandler: mockDmlHandler,
        indexerMeta: mockErrorIndexerMeta as unknown as IndexerMeta
      },
      undefined,
      config
    );

    await indexerDebug.execute(mockBlock);
    await indexerInfo.execute(mockBlock);
    await indexerError.execute(mockBlock);

    expect(mockDebugIndexerMeta.writeLogs.mock.calls[0][0].length).toEqual(5);
    expect(mockDebugIndexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(mockDebugIndexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(mockDebugIndexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);

    expect(mockInfoIndexerMeta.writeLogs.mock.calls[0][0].length).toEqual(5);
    expect(mockInfoIndexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(mockInfoIndexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(mockInfoIndexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);

    expect(mockErrorIndexerMeta.writeLogs.mock.calls[0][0].length).toEqual(5);
    expect(mockErrorIndexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(mockErrorIndexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(mockErrorIndexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);
  });

  test('attaches the backend only header to requests to hasura', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {}
        })
      });
    const indexer = new Indexer(simpleSchemaConfig, { fetch: mockFetch as unknown as typeof fetch }, undefined, config);
    const context = indexer.buildContext(1, []);

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
                'X-Hasura-Role': simpleSchemaConfig.hasuraRoleName(),
                'X-Hasura-Admin-Secret': config.hasuraAdminSecret
              },
              body: JSON.stringify({ query: mutation })
            }
    ]);
  });

  it('call writeLogs method at the end of execution with correct and all logs are present', async () => {
    const mockFetchDebug = jest.fn(() => ({
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

    const indexerMeta: any = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn(),
    };

    const code = `
      console.debug('debug log');
      console.log('info log');
      console.error('error log');
      await context.db.Posts.select({
        account_id: 'morgs_near',
        receipt_id: 'abc',
      });
    `;

    const debugIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.DEBUG);
    const mockDmlHandler: DmlHandler = { select: jest.fn() } as unknown as DmlHandler;
    const indexerDebug = new Indexer(
      debugIndexerConfig,
      { fetch: mockFetchDebug as unknown as typeof fetch, provisioner: genericProvisioner, dmlHandler: mockDmlHandler, indexerMeta },
      undefined,
      config
    );

    await indexerDebug.execute(mockBlock);
    expect(indexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(indexerMeta.writeLogs.mock.calls[0][0]).toHaveLength(5);
  });
  test('does not attach the hasura admin secret header when no role specified', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {}
        })
      });
    const indexer = new Indexer(simpleSchemaConfig, { fetch: mockFetch as unknown as typeof fetch, dmlHandler: genericMockDmlHandler }, undefined, config);

    const mutation = `
            mutation {
                newGreeting(greeting: "howdy") {
                    success
                }
            }
        `;

    await indexer.runGraphQLQuery(mutation, null, 0, null);

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

  test('transformedCode applies the correct transformations', () => {
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, 'console.log(\'hello\')', SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, { dmlHandler: genericMockDmlHandler }, undefined, config);
    const transformedFunction = indexer.transformIndexerFunction();

    expect(transformedFunction).toEqual(`
      async function f(){
        console.log('hello')
      };
      f();
    `);
  });
});
