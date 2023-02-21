import { jest } from '@jest/globals';
import { Block } from '@near-lake/primitives'

import Indexer from './indexer';

describe('Indexer', () => {
    const oldEnv = process.env;

    const GRAPHQL_ENDPOINT = 'mock-graphql-endpoint';

    beforeAll(() => {
        process.env = {
            ...oldEnv,
            GRAPHQL_ENDPOINT,
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
        const block_height = 456;
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => ({
                    Body: {
                        toString: () => JSON.stringify({
                            chunks: [],
                            header: {
                                height: block_height
                            }
                        })
                    }
                })
            })),
        };
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch, s3: mockS3 });

        const functions = {};
        functions['buildnear.testnet/test'] = {code:`
            const foo = 3;
            block.result = context.graphql.mutation(\`set(functionName: "buildnear.testnet/test", key: "height", data: "\$\{block.blockHeight\}")\`);
            mutationsReturnValue['hack'] = function() {return 'bad'}
        `};
        await indexer.runFunctions(block_height, functions);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `mutation {\n_0: set(functionName: "buildnear.testnet/test", key: "height", data: "456")\n}`
                }),
            }
        );
    });

    test('Indexer.writeMutations() should POST a graphQL mutation from a mutation string', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch });

        const functionName = 'buildnear.testnet/test';
        const mutations = [`set(functionName: "${functionName}", key: "foo2", data: "indexer test")`];
        await indexer.writeMutations(functionName, mutations);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: `mutation {\n_0: set(functionName: "${functionName}", key: "foo2", data: "indexer test")\n}` }),
            }
        );
    });

    test('Indexer.writeMutations() should batch multiple mutations in to a single request', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch });

        const functionName = 'buildnear.testnet/test';
        const mutations = [
            `set(functionName: "${functionName}", key: "foo1", data: "indexer test")`,
            `set(functionName: "${functionName}", key: "foo2", data: "indexer test")`
        ];
        await indexer.writeMutations(functionName, mutations);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: `mutation {
_0: set(functionName: "buildnear.testnet/test", key: "foo1", data: "indexer test")
_1: set(functionName: "buildnear.testnet/test", key: "foo2", data: "indexer test")
}`
                }),
            }
        );
    });

    test('Indexer.fetchBlock() should fetch a block from the S3', async () => {
        const author = 'dokiacapital.poolv1.near';
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => ({
                    Body: {
                        toString: () => JSON.stringify({
                            author
                        })
                    }
                })
            })),
        };
        const indexer = new Indexer('mainnet', 'us-west-2', { s3: mockS3 });

        const blockHeight = '84333960';
        const block = await indexer.fetchBlock(blockHeight);

        expect(mockS3.getObject).toHaveBeenCalledTimes(1);
        expect(mockS3.getObject).toHaveBeenCalledWith({
            Bucket: 'near-lake-data-mainnet',
            Key: `${blockHeight.padStart(12, '0')}/block.json`
        });
        expect(block.author).toEqual(author);
    });

    test('Indexer.fetchShard() should fetch the steamer message from S3', async () => {
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => ({
                    Body: {
                        toString: () => JSON.stringify({})
                    }
                })
            })),
        };
        const indexer = new Indexer('mainnet', 'us-west-2', { s3: mockS3 });

        const blockHeight = 82699904;
        const shard = 0;
        await indexer.fetchShard(blockHeight, shard);

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
                promise: () => ({
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
            .mockReturnValueOnce({ // shard
                promise: () => ({
                    Body: {
                        toString: () => JSON.stringify({})
                    }
                })
            })
        const mockS3 = {
            getObject,
        };
        const indexer = new Indexer('mainnet', 'us-west-2', { s3: mockS3 });

        const shard = 0;
        const streamerMessage = await indexer.fetchStreamerMessage(blockHeight);

        expect(getObject).toHaveBeenCalledTimes(2);
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
        const indexer = new Indexer('mainnet', 'us-west-2');

        const transformedFunction = indexer.transformIndexerFunction(`console.log('hello')`);

        expect(transformedFunction).toEqual(`
            (async () => {
                console.log('hello')
            })();
        `);
    });

    test('Indexer.buildImperativeContextForFunction() allows execution of arbitrary GraphQL operations', async () => {
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
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch });

        const context = indexer.buildImperativeContextForFunction();

        const query = `
            query {
                greet()
            }
        `;
        const { greet } = await context.graphql(query);

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
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: query })
            }
        ]);
        expect(mockFetch.mock.calls[1]).toEqual([
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: mutation })
            }
        ]);
    });

    test('Indexer.buildImperativeContextForFunction() throws when a GraphQL response contains errors', async () => {
        const mockFetch = jest.fn()
            .mockResolvedValue({
                json: async () => ({
                    errors: 'boom'
                })
            });
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch });

        const context = indexer.buildImperativeContextForFunction();

        expect(() => context.graphql(`query { hello }`)).rejects.toThrow('boom');
    });

    test('Indexer.buildImperativeContextForFunction() handles GraphQL variables', async () => {
        const mockFetch = jest.fn()
            .mockResolvedValue({
                status: 200,
                json: async () => ({
                    data: 'mock',
                }),
            });
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch });

        const context = indexer.buildImperativeContextForFunction();

        const query = `query($name: String) { hello(name: $name) }`;
        const variables = { name: 'morgan' };
        await context.graphql(query, variables);

        expect(mockFetch.mock.calls[0]).toEqual([
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    variables,
                }),
            },
        ]);
    })
    
    test('Indexer.runFunctions() allows imperative execution of GraphQL operations', async () => {
        const postId = 1;
        const commentId = 2;
        const blockHeight = 82699904;
        const mockFetch = jest.fn()
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
            });
        const mockS3 = {
            getObject: jest.fn()
                .mockReturnValueOnce({ // block
                    promise: () => ({
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
                .mockReturnValueOnce({ // shard
                    promise: () => ({
                        Body: {
                            toString: () => JSON.stringify({})
                        },
                    }),
                }),
        };
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch, s3: mockS3 });

        const functions = {};
        functions['buildnear.testnet/test'] = `
            const { posts } = await context.graphql(\`
                query {
                    posts(where: { id: { _eq: 1 } }) {
                        id
                    }
                }
            \`);

            if (posts.length === 0) {
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

        await indexer.runFunctions(blockHeight, functions, { imperative: true });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[0]).toEqual([
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                query {
                    posts(where: { id: { _eq: 1 } }) {
                        id
                    }
                }
            `
                })
            }
        ]);
        expect(mockFetch.mock.calls[1]).toEqual([
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                mutation {
                    insert_comments(
                        objects: {account_id: "morgs.near", block_height: ${blockHeight}, content: "cool post", post_id: ${postId}}
                    ) {
                        returning {
                            id
                        }
                    }
                }
            `
                })
            }
        ]);
    });
});
