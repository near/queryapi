import { jest } from '@jest/globals';
import { Block } from '@near-lake/primitives'

import Indexer from './indexer';
import {VM} from "vm2";
import Provisioner from './provisioner';

const mockAwsXray = {
    resolveSegment: () => ({
        addError: () => {},
        close: () => {},
        addAnnotation: () => {},
        addNewSubsegment: () => ({
            addAnnotation: () => {},
            close: () => {}
        }),
    }),
    getSegment: () => ({
        addAnnotation: () => {},
        addNewSubsegment: () => ({
            addAnnotation: () => {},
            close: () => {}
        }),
    }),
};

const mockMetrics = {
    putBlockHeight: () => {},
};

describe('Indexer unit tests', () => {
    const oldEnv = process.env;

    const HASURA_ENDPOINT = 'mock-hasura-endpoint';
    const HASURA_ADMIN_SECRET = 'mock-hasura-secret';

    beforeAll(() => {
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
        const block_height = 456;
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => Promise.resolve({
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
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {};
        functions['buildnear.testnet/test'] = {code:`
            const foo = 3;
            block.result = context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\$\{block.blockHeight\}")}\`);
            mutationsReturnValue['hack'] = function() {return 'bad'}
        `};
        await indexer.runFunctions(block_height, functions, false);

        expect(mockFetch.mock.calls).toMatchSnapshot();
    });

    test('Indexer.writeMutations() should POST a graphQL mutation from a mutation string', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });

        const functionName = 'buildnear.testnet/test';
        const mutations = {mutations: [`mutation { _0: set(functionName: "${functionName}", key: "foo2", data: "indexer test") }`], variables: {}, keysValues: {}};
        await indexer.writeMutations(functionName, 'test', mutations);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Hasura-Use-Backend-Only-Permissions': 'true'
                },
                body: JSON.stringify({ query: `mutation { _0: set(functionName: "${functionName}", key: "foo2", data: "indexer test") }`,
                    variables: {}}),
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
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });

        const functionName = 'buildnear.testnet/test';
        const mutations = {mutations: [
                `mutation _0 { set(functionName: "${functionName}", key: "foo1", data: "indexer test") }`,
                `mutation _1 { set(functionName: "${functionName}", key: "foo2", data: "indexer test") }`
            ], variables: {}, keysValues: {}};
        await indexer.writeMutations(functionName, 'test', mutations);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Hasura-Use-Backend-Only-Permissions': 'true'
                },
                body: JSON.stringify({ query:
                        `mutation _0 { set(functionName: "buildnear.testnet/test", key: "foo1", data: "indexer test") }
mutation _1 { set(functionName: "buildnear.testnet/test", key: "foo2", data: "indexer test") }`,
                variables: {}}),
            }
        );
    });

    test('Indexer.fetchBlock() should fetch a block from the S3', async () => {
        const author = 'dokiacapital.poolv1.near';
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => Promise.resolve({
                    Body: {
                        toString: () => JSON.stringify({
                            author
                        })
                    }
                })
            })),
        };
        const indexer = new Indexer('mainnet', { s3: mockS3, awsXray: mockAwsXray, metrics: mockMetrics });

        const blockHeight = '84333960';
        const block = await indexer.fetchBlockPromise(blockHeight);

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
                promise: () => Promise.resolve({
                    Body: {
                        toString: () => JSON.stringify({})
                    }
                })
            })),
        };
        const indexer = new Indexer('mainnet', { s3: mockS3, awsXray: mockAwsXray, metrics: mockMetrics });

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
                promise: () => Promise.resolve({
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
                promise: () => Promise.resolve({
                    Body: {
                        toString: () => JSON.stringify({})
                    }
                })
            })
        const mockS3 = {
            getObject,
        };
        const indexer = new Indexer('mainnet', { s3: mockS3, awsXray: mockAwsXray, metrics: mockMetrics });

        const shard = 0;
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
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics })

        const transformedFunction = indexer.transformIndexerFunction(`console.log('hello')`);

        expect(transformedFunction).toEqual(`
            async function f(){
                console.log('hello')
            };
            f();
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
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });

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
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Hasura-Use-Backend-Only-Permissions': 'true',
                },
                body: JSON.stringify({ query: query })
            }
        ]);
        expect(mockFetch.mock.calls[1]).toEqual([
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

    test('Indexer.buildImperativeContextForFunction() can fetch from the near social api', async () => {
        const mockFetch = jest.fn();
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });

        const context = indexer.buildImperativeContextForFunction();

        await context.fetchFromSocialApi('/index', {
            method: 'POST',
            headers: {
                ['Content-Type']: 'application/json',
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

    test('Indexer.buildImperativeContextForFunction() throws when a GraphQL response contains errors', async () => {
        const mockFetch = jest.fn()
            .mockResolvedValue({
                json: async () => ({
                    errors: ['boom']
                })
            });
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });

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
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });

        const context = indexer.buildImperativeContextForFunction();

        const query = `query($name: String) { hello(name: $name) }`;
        const variables = { name: 'morgan' };
        await context.graphql(query, variables);

        expect(mockFetch.mock.calls[0]).toEqual([
            `${HASURA_ENDPOINT}/v1/graphql`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Hasura-Use-Backend-Only-Permissions': 'true',
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
                    promise: () => Promise.resolve({
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
                    promise: () => Promise.resolve({
                        Body: {
                            toString: () => JSON.stringify({})
                        },
                    }),
                }),
        };
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {};
        functions['buildnear.testnet/test'] = {code:`
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
        `};

        await indexer.runFunctions(blockHeight, functions, false, { imperative: true });

        expect(mockFetch.mock.calls).toMatchSnapshot();
    });

    test('Indexer.runFunctions() console.logs', async () => {
        const logs = []
        const context = {log: (...m) => {
            logs.push(...m)
        }};
        const vm = new VM();
        vm.freeze(context, 'context');
        vm.freeze(context, 'console');
        await vm.run('console.log("hello", "brave new"); context.log("world")');
        expect(logs).toEqual(['hello','brave new','world']);
    });

    test("Errors thrown in VM can be caught outside the VM", async () => {
        const vm = new VM();
        const t = () => {
            vm.run("throw new Error('boom')")
        }
        await expect(t).toThrow('boom');
    });

    test('Indexer.runFunctions() catches errors', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const block_height = 456;
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => Promise.resolve({
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
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {};
        functions['buildnear.testnet/test'] = {code:`
            throw new Error('boom');
        `};

        await expect(indexer.runFunctions(block_height, functions, false, {imperative: true })).rejects.toThrow(new Error('boom'))
        expect(mockFetch.mock.calls).toMatchSnapshot();
    });

    test('Indexer.runFunctions() provisions a GraphQL endpoint with the specified schema', async () => {
        const postId = 1;
        const commentId = 2;
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
                    promise: () => Promise.resolve({
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
                    promise: () => Promise.resolve({
                        Body: {
                            toString: () => JSON.stringify({})
                        },
                    }),
                }),
        };
        const provisioner = {
            isUserApiProvisioned: jest.fn().mockReturnValue(false),
            provisionUserApi: jest.fn(),
        }
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, provisioner, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {
            'morgs.near/test': {
                account_id: 'morgs.near',
                function_name: 'test',
                code: '',
                schema: 'schema',
            }
        };
        await indexer.runFunctions(1, functions, false, { provision: true });

        expect(provisioner.isUserApiProvisioned).toHaveBeenCalledWith('morgs.near', 'test');
        expect(provisioner.provisionUserApi).toHaveBeenCalledTimes(1);
        expect(provisioner.provisionUserApi).toHaveBeenCalledWith(
            'morgs.near',
            'test',
            'schema'
        )
    });

    test('Indexer.runFunctions() skips provisioning if the endpoint exists', async () => {
        const postId = 1;
        const commentId = 2;
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
                    promise: () => Promise.resolve({
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
                    promise: () => Promise.resolve({
                        Body: {
                            toString: () => JSON.stringify({})
                        },
                    }),
                }),
        };
        const provisioner = {
            isUserApiProvisioned: jest.fn().mockReturnValue(true),
            provisionUserApi: jest.fn(),
        }
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, provisioner, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {
            'morgs.near/test': {
                code: '',
                schema: 'schema',
            }
        };
        await indexer.runFunctions(1, functions, false, { provision: true });

        expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
    });

    test('Indexer.runFunctions() supplies the required role to the GraphQL endpoint', async () => {
        const postId = 1;
        const commentId = 2;
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
                    promise: () => Promise.resolve({
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
                    promise: () => Promise.resolve({
                        Body: {
                            toString: () => JSON.stringify({})
                        },
                    }),
                }),
        };
        const provisioner = {
            isUserApiProvisioned: jest.fn().mockReturnValue(true),
            provisionUserApi: jest.fn(),
        }
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, provisioner, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {
            'morgs.near/test': {
                code: `
                    context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\$\{block.blockHeight\}")}\`);
                `,
                schema: 'schema',
            }
        };
        await indexer.runFunctions(blockHeight, functions, false, { provision: true });

        expect(provisioner.provisionUserApi).not.toHaveBeenCalled();
        expect(mockFetch.mock.calls).toMatchSnapshot();
    });

    test('Indexer.runFunctions() logs provisioning failures', async () => {
        const postId = 1;
        const commentId = 2;
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
                    promise: () => Promise.resolve({
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
                    promise: () => Promise.resolve({
                        Body: {
                            toString: () => JSON.stringify({})
                        },
                    }),
                }),
        };
        const error = new Error('something went wrong with provisioning');
        const provisioner = {
            isUserApiProvisioned: jest.fn().mockReturnValue(false),
            provisionUserApi: jest.fn().mockRejectedValue(error),
        }
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, provisioner, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {
            'morgs.near/test': {
                code: `
                    context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\$\{block.blockHeight\}")}\`);
                `,
                schema: 'schema',
            }
        };

        await expect(indexer.runFunctions(blockHeight, functions, false, { provision: true })).rejects.toThrow(error)
        expect(mockFetch.mock.calls).toMatchSnapshot();
    });

    test('Indexer.runFunctions() sets the current historical block height', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const block_height = 456;
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => Promise.resolve({
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
        const metrics = {
            putBlockHeight: jest.fn().mockReturnValueOnce({ promise: jest.fn() }),
        };
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, awsXray: mockAwsXray, metrics });

        const functions = {};
        functions['buildnear.testnet/test'] = {
            code:`
                console.log('hey')
            `,
            account_id: 'buildnear.testnet',
            function_name: 'test'
        };
        await indexer.runFunctions(block_height, functions, true);

        expect(mockFetch.mock.calls).toMatchSnapshot();
    });

    test('Indexer.runFunctions() publishes the current block height', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const block_height = 456;
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => Promise.resolve({
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
        const metrics = {
            putBlockHeight: jest.fn().mockReturnValueOnce({ promise: jest.fn() }),
        };
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, awsXray: mockAwsXray, metrics });

        const functions = {};
        functions['buildnear.testnet/test'] = {
            code:`
                const foo = 3;
                block.result = context.graphql(\`mutation { set(functionName: "buildnear.testnet/test", key: "height", data: "\$\{block.blockHeight\}")}\`);
                mutationsReturnValue['hack'] = function() {return 'bad'}
            `,
            account_id: 'buildnear.testnet',
            function_name: 'test'
        };
        await indexer.runFunctions(block_height, functions, false);

        expect(metrics.putBlockHeight).toHaveBeenCalledWith('buildnear.testnet', 'test', false, block_height);
    });

    test('does not attach the hasura admin secret header when no role specified', async () => {
        const mockFetch = jest.fn()
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({
                    data: {}
                })
            });
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });
        const context = indexer.buildImperativeContextForFunction();

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
        const indexer = new Indexer('mainnet', { fetch: mockFetch, awsXray: mockAwsXray, metrics: mockMetrics });
        const context = indexer.buildImperativeContextForFunction(null, null, null, role);

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

    test('allows writing of custom metrics', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const block_height = 456;
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => Promise.resolve({
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
        const metrics = {
            putBlockHeight: () => {},
            putCustomMetric: jest.fn(),
        };
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, awsXray: mockAwsXray, metrics });

        const functions = {};
        functions['buildnear.testnet/test'] = {code:`
            context.putMetric('TEST_METRIC', 1)
        `};
        await indexer.runFunctions(block_height, functions, true, { imperative: true });

        expect(metrics.putCustomMetric).toHaveBeenCalledWith(
            'buildnear.testnet',
            'test',
            true,
            'CUSTOM_TEST_METRIC',
            1
        );
    });

    // The unhandled promise causes problems with test reporting.
    // Note unhandled promise rejections fail to proceed to the next function on AWS Lambda
    test.skip('Indexer.runFunctions() continues despite promise rejection, unable to log rejection', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const block_height = 456;
        const mockS3 = {
            getObject: jest.fn(() => ({
                promise: () => Promise.resolve({
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
        const indexer = new Indexer('mainnet', { fetch: mockFetch, s3: mockS3, awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {};
        functions['buildnear.testnet/fails'] = {code:`
                Promise.reject('rejected');
        `};
        functions['buildnear.testnet/succeeds'] = {code:`
                console.log('succeeded');
        `};
        await indexer.runFunctions(block_height, functions, false, {imperative: true});

        // console.log('"Indexer.runFunctions() catches errors" calls:', mockFetch.mock.calls);
        expect(mockFetch).toHaveBeenCalledTimes(5); // 2 logs, 1 state
        // expect(mockFetch.mock.calls[1]).toEqual([
        //     GRAPHQL_ENDPOINT,
        //     {
        //         method: 'POST',
        //         headers: {
        //             'Content-Type': 'application/json',
        //         },
        //         body: JSON.stringify({
        //             query: `mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){\n  insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {\n    id\n  }\n}\n`,
        //             variables: {"function_name":"buildnear.testnet/test","block_height":456,"message":"[\"Error running IndexerFunction\",\"rejected\"]"}
        //         }),
        //     }
        // ]);
        expect(mockFetch.mock.calls[1]).toEqual([
            GRAPHQL_ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({query:`mutation WriteBlock($function_name: String!, $block_height: numeric!) {
                  insert_indexer_state(
                    objects: {current_block_height: $block_height, function_name: $function_name}
                    on_conflict: {constraint: indexer_state_pkey, update_columns: current_block_height}
                  ) {
                    returning {
                      current_block_height
                      function_name
                    }
                  }
                }`,variables:{function_name:"buildnear.testnet/fails",block_height:456}}),
            }
        ]);
    });
});
