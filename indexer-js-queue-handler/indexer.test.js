import Indexer from './indexer';

describe('Indexer', () => {

    test('Indexer.runFunctions() should execute all functions against the current block', async () => {
        const indexer = new Indexer();
        const functions = {};
        functions['buildnear.testnet/test'] = 'const foo = 3; streamerMessage.result = context.set(foo, 789); mutationsReturnValue[\'hack\'] = function() {return \'bad\'}';
        // const functions = await indexer.fetchIndexerFunctions();
        const block = {block: {height: 456}}; // mockblock
        const mutations = await indexer.runFunctions(block, functions);
        expect(mutations).toEqual({"buildnear.testnet/test": ["mutation { set(functionName: \"buildnear.testnet/test\", key: \"3\", data: \"789\") }"]});
    });

    test('Indexer.writeMutations() should POST a graphQL mutation from key value pairs', async () => {
        const indexer = new Indexer();
        const functionName = 'buildnear.testnet/test';
        const mutations = {foo2: 'indexer test'};
        const mutationList = await indexer.writeMutations(functionName, mutations);
        expect(mutationList).toEqual(["mutation { set(functionName: \"buildnear.testnet/test\", key: \"foo2\", data: \"indexer test\") }"]);
    });
});
