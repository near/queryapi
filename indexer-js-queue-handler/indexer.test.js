import { jest } from '@jest/globals';

import Indexer from './indexer';

describe('Indexer', () => {

    test('Indexer.runFunctions() should execute all functions against the current block', async () => {
        const mockFetch = async () => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        });
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch });

        const functions = {};
        functions['buildnear.testnet/test'] = 'const foo = 3; block.result = context.set(foo, 789); mutationsReturnValue[\'hack\'] = function() {return \'bad\'}';
        const block = {block: {height: 456}}; // mockblock
        const mutations = await indexer.runFunctions(block, functions);

        expect(mutations).toEqual({"buildnear.testnet/test": ["mutation { set(functionName: \"buildnear.testnet/test\", key: \"3\", data: \"789\") }"]});
    });

    test('Indexer.writeMutations() should POST a graphQL mutation from key value pairs', async () => {
        const mockFetch = jest.fn(() => ({
            status: 200,
            json: async () => ({
                errors: null,
            }),
        }));
        const indexer = new Indexer('mainnet', 'us-west-2', { fetch: mockFetch });

        const functionName = 'buildnear.testnet/test';
        const mutations = {foo2: 'indexer test'};
        await indexer.writeMutations(functionName, mutations);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            'https://query-api-graphql-vcqilefdcq-uc.a.run.app/graphql',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: `mutation { set(functionName: \"${functionName}\", key: \"foo2\", data: \"${mutations.foo2}\") }` }),
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
});
