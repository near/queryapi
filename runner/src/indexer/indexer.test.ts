import { Block } from '@near-lake/primitives';
import type fetch from 'node-fetch';
import type AWS from 'aws-sdk';

import Indexer from './indexer';
import { VM } from 'vm2';

describe('Indexer unit tests', () => {
  const oldEnv = process.env;

  const HASURA_ENDPOINT = 'mock-hasura-endpoint';
  const HASURA_ADMIN_SECRET = 'mock-hasura-secret';
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
  "public"."My Table1" (id serial PRIMARY KEY);

CREATE TABLE
  "Another-Table" (id serial PRIMARY KEY);

CREATE TABLE
IF NOT EXISTS
  "Third-Table" (id serial PRIMARY KEY);

CREATE TABLE
  yet_another_table (id serial PRIMARY KEY);
`;
  const genericMockFetch = jest.fn()
    .mockResolvedValue({
      status: 200,
      json: async () => ({
        data: 'mock',
      }),
    });

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      HASURA_ENDPOINT,
      HASURA_ADMIN_SECRET
    };
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  test('Indexer.runFunctions() should execute all functions against the current block', async () => {
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const blockHeight = 456;
    const mockS3 = {
      getObject: jest.fn(() => ({
        promise: async () => await Promise.resolve({
          Body: {
            toString: () => JSON.stringify({
              chunks: [],
              header: {
                height: blockHeight
              }
            })
          }
        })
      })),
    } as unknown as AWS.S3;
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch, s3: mockS3 });

    const functions: Record<string, any> = {};
    functions['buildnear.testnet/test'] = {
      code: `
            const foo = 3;
            block.result = context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
        `,
      schema: SIMPLE_SCHEMA
    };
    await indexer.runFunctions(blockHeight, functions, false);

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('Indexer.fetchBlock() should fetch a block from the S3', async () => {
    const author = 'dokiacapital.poolv1.near';
    const mockS3 = {
      getObject: jest.fn(() => ({
        promise: async () => await Promise.resolve({
          Body: {
            toString: () => JSON.stringify({
              author
            })
          }
        })
      })),
    } as unknown as AWS.S3;
    const indexer = new Indexer('mainnet', { s3: mockS3 });

    const blockHeight = 84333960;
    const block = await indexer.fetchBlockPromise(blockHeight);

    expect(mockS3.getObject).toHaveBeenCalledTimes(1);
    expect(mockS3.getObject).toHaveBeenCalledWith({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/block.json`
    });
    expect(block.author).toEqual(author);
  });

  test('Indexer.fetchShard() should fetch the steamer message from S3', async () => {
    const mockS3 = {
      getObject: jest.fn(() => ({
        promise: async () => await Promise.resolve({
          Body: {
            toString: () => JSON.stringify({})
          }
        })
      })),
    } as unknown as AWS.S3;
    const indexer = new Indexer('mainnet', { s3: mockS3 });

    const blockHeight = 82699904;
    const shard = 0;
    await indexer.fetchShardPromise(blockHeight, shard);

    expect(mockS3.getObject).toHaveBeenCalledTimes(1);
    expect(mockS3.getObject).toHaveBeenCalledWith({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_${shard}.json`
    });
  });

  test('Indexer.fetchStreamerMessage() should fetch the block/shards and construct the streamer message', async () => {
    const blockHeight = 85233529;
    const blockHash = 'xyz';
    const getObject = jest.fn()
      .mockReturnValueOnce({ // block
        promise: async () => await Promise.resolve({
          Body: {
            toString: () => JSON.stringify({
              chunks: [0],
              header: {
                height: blockHeight,
                hash: blockHash,
              }
            })
          }
        })
      })
      .mockReturnValue({ // shard
        promise: async () => await Promise.resolve({
          Body: {
            toString: () => JSON.stringify({})
          }
        })
      });
    const mockS3 = {
      getObject,
    } as unknown as AWS.S3;
    const indexer = new Indexer('mainnet', { s3: mockS3 });

    const streamerMessage = await indexer.fetchStreamerMessage(blockHeight);

    expect(getObject).toHaveBeenCalledTimes(5);
    expect(getObject.mock.calls[0][0]).toEqual({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/block.json`
    });
    expect(getObject.mock.calls[1][0]).toEqual({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_0.json`
    });

    const block = Block.fromStreamerMessage(streamerMessage);

    expect(block.blockHeight).toEqual(blockHeight);
    expect(block.blockHash).toEqual(blockHash);
  });

  test('Indexer.transformIndexerFunction() applies the necessary transformations', () => {
    const indexer = new Indexer('mainnet');

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
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch });

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
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': 'morgs_near',
                'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
              },
              body: JSON.stringify({ query })
            }
    ]);
    expect(mockFetch.mock.calls[1]).toEqual([
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': 'morgs_near',
                'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
              },
              body: JSON.stringify({ query: mutation })
            }
    ]);
  });

  test('Indexer.buildContext() can fetch from the near social api', async () => {
    const mockFetch = jest.fn();
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch });

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
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch });

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
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch });

    const context = indexer.buildContext(SIMPLE_SCHEMA, INDEXER_NAME, 1, HASURA_ROLE);

    const query = 'query($name: String) { hello(name: $name) }';
    const variables = { name: 'morgan' };
    await context.graphql(query, variables);

    expect(mockFetch.mock.calls[0]).toEqual([
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': 'morgs_near',
                'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
              },
              body: JSON.stringify({
                query,
                variables,
              }),
            },
    ]);
  });

  test('indexer builds context and inserts an objects into existing table', async () => {
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return { insert: jest.fn().mockReturnValue([{ colA: 'valA' }, { colA: 'valA' }]) };
      })
    };

    const indexer = new Indexer('mainnet', { fetch: genericMockFetch as unknown as typeof fetch, DmlHandler: mockDmlHandler });
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

  test('indexer builds context and selects objects from existing table', async () => {
    const selectFn = jest.fn();
    selectFn.mockImplementation((...args) => {
      // Expects limit to be last parameter
      return args[args.length - 1] === null ? [{ colA: 'valA' }, { colA: 'valA' }] : [{ colA: 'valA' }];
    });
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return { select: selectFn };
      })
    };

    const indexer = new Indexer('mainnet', { fetch: genericMockFetch as unknown as typeof fetch, DmlHandler: mockDmlHandler });
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
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return {
          update: jest.fn().mockImplementation((_, __, whereObj, updateObj) => {
            if (whereObj.account_id === 'morgs_near' && updateObj.content === 'test_content') {
              return [{ colA: 'valA' }, { colA: 'valA' }];
            }
            return [{}];
          })
        };
      })
    };

    const indexer = new Indexer('mainnet', { fetch: genericMockFetch as unknown as typeof fetch, DmlHandler: mockDmlHandler });
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
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return {
          upsert: jest.fn().mockImplementation((_, __, objects, conflict, update) => {
            if (objects.length === 2 && conflict.includes('account_id') && update.includes('content')) {
              return [{ colA: 'valA' }, { colA: 'valA' }];
            } else if (objects.length === 1 && conflict.includes('account_id') && update.includes('content')) {
              return [{ colA: 'valA' }];
            }
            return [{}];
          })
        };
      })
    };

    const indexer = new Indexer('mainnet', { fetch: genericMockFetch as unknown as typeof fetch, DmlHandler: mockDmlHandler });
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
    const mockDmlHandler: any = {
      create: jest.fn().mockImplementation(() => {
        return { delete: jest.fn().mockReturnValue([{ colA: 'valA' }, { colA: 'valA' }]) };
      })
    };

    const indexer = new Indexer('mainnet', { fetch: genericMockFetch as unknown as typeof fetch, DmlHandler: mockDmlHandler });
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

    const indexer = new Indexer('mainnet', { fetch: genericMockFetch as unknown as typeof fetch, DmlHandler: mockDmlHandler });
    const context = indexer.buildContext(STRESS_TEST_SCHEMA, 'morgs.near/social_feed1', 1, 'postgres');

    expect(Object.keys(context.db)).toStrictEqual([
      'CreatorQuest',
      'ComposerQuest',
      'ContractorQuest',
      'Posts',
      'Comments',
      'PostLikes',
      'AnotherTable',
      'ThirdTable',
      'YetAnotherTable']);
    expect(Object.keys(context.db.CreatorQuest)).toStrictEqual([
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

    const indexer = new Indexer('mainnet', { fetch: genericMockFetch as unknown as typeof fetch, DmlHandler: mockDmlHandler });
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

    const mockS3 = {
      getObject: jest.fn()
        .mockReturnValueOnce({ // block
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({
                chunks: [0],
                header: {
                  height: blockHeight,
                },
              }),
            },
          }),
        })
        .mockReturnValue({ // shard
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({})
            },
          }),
        }),
    } as unknown as AWS.S3;
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch, s3: mockS3 });

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

    await indexer.runFunctions(blockHeight, functions, false);

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
    const mockS3 = {
      getObject: jest.fn(() => ({
        promise: async () => await Promise.resolve({
          Body: {
            toString: () => JSON.stringify({
              chunks: [],
              header: {
                height: blockHeight
              }
            })
          }
        })
      })),
    } as unknown as AWS.S3;
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch, s3: mockS3 });

    const functions: Record<string, any> = {};
    functions['buildnear.testnet/test'] = {
      code: `
            throw new Error('boom');
        `,
      schema: SIMPLE_SCHEMA
    };

    await expect(indexer.runFunctions(blockHeight, functions, false)).rejects.toThrow(new Error('boom'));
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
    const mockS3 = {
      getObject: jest
        .fn()
        .mockReturnValueOnce({ // block
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({
                chunks: [0],
                header: {
                  height: blockHeight,
                },
              }),
            },
          }),
        })
        .mockReturnValue({ // shard
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({})
            },
          }),
        }),
    } as unknown as AWS.S3;
    const provisioner: any = {
      isUserApiProvisioned: jest.fn().mockReturnValue(false),
      provisionUserApi: jest.fn(),
    };
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch, s3: mockS3, provisioner });

    const functions = {
      'morgs.near/test': {
        account_id: 'morgs.near',
        function_name: 'test',
        code: '',
        schema: SIMPLE_SCHEMA,
      }
    };
    await indexer.runFunctions(1, functions, false, { provision: true });

    expect(provisioner.isUserApiProvisioned).toHaveBeenCalledWith('morgs.near', 'test');
    expect(provisioner.provisionUserApi).toHaveBeenCalledTimes(1);
    expect(provisioner.provisionUserApi).toHaveBeenCalledWith(
      'morgs.near',
      'test',
      SIMPLE_SCHEMA
    );
  });

  test('Indexer.runFunctions() skips provisioning if the endpoint exists', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockS3 = {
      getObject: jest
        .fn()
        .mockReturnValueOnce({ // block
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({
                chunks: [0],
                header: {
                  height: blockHeight,
                },
              }),
            },
          }),
        })
        .mockReturnValue({ // shard
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({})
            },
          }),
        }),
    } as unknown as AWS.S3;
    const provisioner: any = {
      isUserApiProvisioned: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
    };
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch, s3: mockS3, provisioner });

    const functions: Record<string, any> = {
      'morgs.near/test': {
        code: '',
        schema: SIMPLE_SCHEMA,
      }
    };
    await indexer.runFunctions(1, functions, false, { provision: true });

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
  });

  test('Indexer.runFunctions() supplies the required role to the GraphQL endpoint', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockS3 = {
      getObject: jest
        .fn()
        .mockReturnValueOnce({ // block
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({
                chunks: [0],
                header: {
                  height: blockHeight,
                },
              }),
            },
          }),
        })
        .mockReturnValue({ // shard
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({})
            },
          }),
        }),
    } as unknown as AWS.S3;
    const provisioner: any = {
      isUserApiProvisioned: jest.fn().mockReturnValue(true),
      provisionUserApi: jest.fn(),
    };
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch, s3: mockS3, provisioner });

    const functions: Record<string, any> = {
      'morgs.near/test': {
        code: `
                    context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
                `,
        schema: SIMPLE_SCHEMA,
      }
    };
    await indexer.runFunctions(blockHeight, functions, false, { provision: true });

    expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('Indexer.runFunctions() logs provisioning failures', async () => {
    const blockHeight = 82699904;
    const mockFetch = jest.fn(() => ({
      status: 200,
      json: async () => ({
        errors: null,
      }),
    }));
    const mockS3 = {
      getObject: jest
        .fn()
        .mockReturnValueOnce({ // block
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({
                chunks: [0],
                header: {
                  height: blockHeight,
                },
              }),
            },
          }),
        })
        .mockReturnValue({ // shard
          promise: async () => await Promise.resolve({
            Body: {
              toString: () => JSON.stringify({})
            },
          }),
        }),
    } as unknown as AWS.S3;
    const error = new Error('something went wrong with provisioning');
    const provisioner: any = {
      isUserApiProvisioned: jest.fn().mockReturnValue(false),
      provisionUserApi: jest.fn().mockRejectedValue(error),
    };
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch, s3: mockS3, provisioner });

    const functions: Record<string, any> = {
      'morgs.near/test': {
        code: `
                    context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\${block.blockHeight}")}\`);
                `,
        schema: 'schema',
      }
    };

    await expect(indexer.runFunctions(blockHeight, functions, false, { provision: true })).rejects.toThrow(error);
    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  test('does not attach the hasura admin secret header when no role specified', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {}
        })
      });
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch });
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
            `${HASURA_ENDPOINT}/v1/graphql`,
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
    const indexer = new Indexer('mainnet', { fetch: mockFetch as unknown as typeof fetch });
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
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                'X-Hasura-Role': role,
                'X-Hasura-Admin-Secret': HASURA_ADMIN_SECRET
              },
              body: JSON.stringify({ query: mutation })
            }
    ]);
  });
});
