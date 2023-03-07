import Indexer from './indexer';

/** These tests require the following Environment Variables to be set: GRAPHQL_ENDPOINT */
describe('Indexer integration tests', () => {

    test('Indexer.runFunctions() should execute an imperative style test function against a given block using key-value storage', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};
        functions['buildnear.testnet/itest1'] = {code: 'context.set("BlockHeight", block.header().height);'};
        const block_height = 85376002;
        await indexer.runFunctions(block_height, functions, {imperative: true});
        const valueSet = await indexer.runGraphQLQuery('query MyQuery {\n' +
            '  indexer_storage(\n' +
            '    where: {key_name: {_eq: "BlockHeight"}, function_name: {_eq: "buildnear.testnet/itest1"}}\n' +
            '  ) {\n' +
            '    value\n' +
            '  }\n' +
            '}')
        expect(valueSet.indexer_storage[0].value).toEqual("85376002");
    });

    test('Indexer.runFunctions() should execute a test function against a given block using key-value storage', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};
        functions['buildnear.testnet/test'] = {code: 'context.set("BlockHeight", block.header().height);'};
        const block_height = 85376546;
        const mutations = await indexer.runFunctions(block_height, functions);
        expect(mutations[0]).toEqual({"keysValues": {"BlockHeight": 85376546}, "mutations": [], "variables": {}});
    });

    test('Indexer.runFunctions() should execute a test function against a given block using a full mutation to write to key-value storage', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};
        functions['buildnear.testnet/itest3'] = {code: 'context.graphql(`mutation { insert_indexer_storage_one(object: {function_name: "buildnear.testnet/itest3", key_name: "BlockHeight", value: "${block.header().height}"} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}}`);'};
        const block_height = 85376546;
        const mutations = await indexer.runFunctions(block_height, functions);
        expect(mutations[0]).toBeDefined()
        expect(JSON.stringify(mutations[0])).toContain("insert_indexer_storage_one");
    });

    /** Note that the on_conflict block in the mutation is for test repeatability.
     * The posts table has had its unique index dropped and replaced with a unique constraint
     * due to known Hasura issues with unique indexes vs unique constraints  */
    test('Indexer.runFunctions() should execute a near social function against a given block', async () => {

        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};
        functions['buildnear.testnet/test'] = {code:

`           const SOCIAL_DB = 'social.near';
            function base64decode(encodedValue) {
              let buff = Buffer.from(encodedValue, 'base64');
              return JSON.parse(buff.toString('utf-8'));
            }

            const nearSocialPosts = block
                .actions()
                .filter(action => action.receiverId === SOCIAL_DB)
                .flatMap(action =>
                    action
                        .operations
                        .map(operation => operation['FunctionCall'])
                        .filter(operation => operation?.methodName === 'set')
                        .map(functionCallOperation => ({
                            ...functionCallOperation,
                            args: base64decode(functionCallOperation.args),
                            receiptId: action.receiptId,
                        }))
                        .filter(functionCall => {
                            const accountId = Object.keys(functionCall.args.data)[0];
                            return 'post' in functionCall.args.data[accountId]
                                || 'index' in functionCall.args.data[accountId];
                        })
                );
        if (nearSocialPosts.length > 0) {
            const blockHeight = block.blockHeight;
            const blockTimestamp = block.header().timestampNanosec;
            nearSocialPosts.forEach(postAction => {
                const accountId = Object.keys(postAction.args.data)[0];
                if (postAction.args.data[accountId].post && 'main' in postAction.args.data[accountId].post) {
                    const postData = {account_id: accountId, block_height: blockHeight, block_timestamp: blockTimestamp,
                        receipt_id: postAction.receiptId, post: postAction.args.data[accountId].post.main
                        };
                    const mutationData = { post: { account_id: accountId, block_height: postData.block_height.toString(),
                      block_timestamp: postData.block_timestamp, receipt_id: postData.receipt_id, 
                      content: postData.post}};
                    context.graphql('mutation createPost($post:posts_insert_input!) {' +  
                        'insert_posts_one(object: $post on_conflict: {constraint: posts_account_id_block_height_key, update_columns: content}) { id } }',
                        mutationData);
                }
            });
        }
`       };

        const block_height = 85242526; // post,  // 84940247; // comment
        const returnValue = await indexer.runFunctions(block_height, functions);

        expect(returnValue[0].mutations.length).toEqual(1);
        expect(returnValue[0].mutations[0]).toContain("mutation createPost($post:posts_insert_input!) {insert_posts_one(object: $post on_conflict: {constraint: posts_account_id_block_height_key, update_columns: content}) { id } }");
    });

    /** Note that the on_conflict block in the mutation is for test repeatability.
     * The comments table has had its unique index dropped and replaced with a unique constraint
     * due to known Hasura issues with unique indexes vs unique constraints  */
    test('Indexer.runFunctions() should execute an imperative style near social function against a given block', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};

        functions['buildnear.testnet/itest5'] = {code:`
            const { posts } = await context.graphql(\`
                query {
                    posts(where: { id: { _eq: 2 } }) {
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
                        objects: { account_id: "buildnear.testnet", content: "cool post", post_id: \${post.id},
                        block_height: \${block.blockHeight}, block_timestamp: \${block.blockHeight}, 
                        receipt_id: "12345" }
                        on_conflict: {constraint: comments_post_id_account_id_block_height_key, update_columns: block_timestamp}
                    ) {
                        returning {
                            id
                        }
                    }
                }
            \`);

            return (\`Created comment \${id} on post \${post.id}\`)
        `};

        const block_height = 85376002;
        await indexer.runFunctions(block_height, functions, {imperative: true});
        const valueSet = await indexer.runGraphQLQuery('query MyQuery {\n' +
            '  comments(where: {account_id: {_eq: "buildnear.testnet"}}) {\n' +
            '    id\n' +
            '    post_id\n' +
            '  }\n' +
            '}')
        expect(valueSet.comments[0].post_id).toEqual(2);
    });

    test("writeLog() should write a log to the database", async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const id = await indexer.writeLog("buildnear.testnet/itest", 85376002, "test message");
        expect(id).toBeDefined();
        expect(id.length).toBe(36);
    });

    test("fetchIndexerFunctions() should fetch the indexer functions from the database", async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = await indexer.fetchIndexerFunctions();
        console.log(functions);
        expect(functions).toBeDefined();
        expect(Object.keys(functions).length).toBeGreaterThan(0);
    });
    // todo test indexer.runFunctions() with a function that has a bad graphql mutation

    test("writeFunctionState should write a function state to the database", async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const result = await indexer.writeFunctionState("buildnear.testnet/itest8", 85376002);
        expect(result).toBeDefined();
        expect(result.insert_indexer_state.returning[0].current_block_height).toBe(85376002);
    });
    test("function that throws an error should catch the error", async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');

        const functions = {};
        functions['buildnear.testnet/test'] = {code:`
            throw new Error('boom');
        `};
        const block_height = 85376002;

        await indexer.runFunctions(block_height, functions);
        // no error thrown is success
    });

    test("rejected graphql promise is awaited and caught", async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');

        const functions = {};
        functions['buildnear.testnet/itest3'] = {code:
                'context.graphql(`mutation { incorrect_function_call()`);'};
        const block_height = 85376002;

        await indexer.runFunctions(block_height, functions, {imperative: true});
        // no error thrown is success
    });

    // Unreturned promise rejection seems to be uncatchable even with process.on('unhandledRejection'
    // However, the next function is run
    test.skip("function that rejects a promise should catch the error", async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');

        const functions = {};
        functions['buildnear.testnet/fails'] = {code:`
            Promise.reject('rejected promise');
        `};
        functions['buildnear.testnet/succeeds'] = {code:`
            console.log('Post promise rejection function succeeded');
        `};
        const block_height = 85376002;

        await indexer.runFunctions(block_height, functions);
    });
});

