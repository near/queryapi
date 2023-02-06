import Indexer from './indexer';

describe('Indexer', () => {

    test('Indexer.runFunctions() should execute all functions against the current block', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};
        functions['buildnear.testnet/test'] = 'const foo = 3; block.result = context.set(foo, 789); mutationsReturnValue[\'hack\'] = function() {return \'bad\'}';
        const block = {block: {height: 456}}; // mockblock
        const mutations = await indexer.runFunctions(block, functions);
        expect(mutations).toEqual({"buildnear.testnet/test": ["mutation { set(functionName: \"buildnear.testnet/test\", key: \"3\", data: \"789\") }"]});
    });

    test('Indexer.writeMutations() should POST a graphQL mutation from key value pairs', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functionName = 'buildnear.testnet/test';
        const mutations = {foo2: 'indexer test'};
        const mutationList = await indexer.writeMutations(functionName, mutations);
        expect(mutationList).toEqual(["mutation { set(functionName: \"buildnear.testnet/test\", key: \"foo2\", data: \"indexer test\") }"]);
    });

    test('Indexer.fetchBlock() should fetch a block from the S3', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const block = await indexer.fetchBlock('84333960');
        expect(block.author).toEqual('dokiacapital.poolv1.near');
    });
});
