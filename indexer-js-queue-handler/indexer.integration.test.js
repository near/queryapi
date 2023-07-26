import Indexer from './indexer';
import fetch from 'node-fetch';

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


/** These tests require the following Environment Variables to be set: HASURA_ENDPOINT, HASURA_ADMIN_SECRET */
describe('Indexer integration tests', () => {

    test('Indexer.runFunctions() should execute an imperative style test function against a given block using key-value storage', async () => {
        const indexer = new Indexer('mainnet', { fetch: fetch, awsXray: mockAwsXray, metrics: mockMetrics });
        const functions = {};
        functions['buildnear.testnet/itest1'] = {provisioned: false, code: 'context.set("BlockHeight", block.header().height);', schema: 'create table indexer_storage (function_name text, key_name text, value text, primary key (function_name, key_name));'};
        const block_height = 85376002;
        const r = await indexer.runFunctions(block_height, functions, {imperative: true, provision: true});
        const valueSet = await indexer.runGraphQLQuery('query MyQuery {\n' +
            '  buildnear_testnet_itest1_indexer_storage(\n' +
            '    where: {key_name: {_eq: "BlockHeight"}, function_name: {_eq: "buildnear.testnet/itest1"}}\n' +
            '  ) {\n' +
            '    value\n' +
            '  }\n' +
            '}', {}, 'buildnear.testnet/itest1', '85376002', 'buildnear_testnet');
        expect(valueSet.buildnear_testnet_itest1_indexer_storage[0].value).toEqual("85376002");
    }, 30000);

    test('Indexer.runFunctions() should execute a test function against a given block using key-value storage', async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });
        const functions = {};
        functions['buildnear.testnet/itest1'] = {code: 'context.set("BlockHeight", block.header().height);'};
        const block_height = 85376546;
        const mutations = await indexer.runFunctions(block_height, functions, {provision: true});
        expect(mutations[0]).toEqual(`mutation writeKeyValues($function_name: String!, $key_name0: String!, $value0: String!) {
            _0: insert_buildnear_testnet_itest1_indexer_storage_one(object: {function_name: $function_name, key_name: $key_name0, value: $value0} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}
        }`);
    }, 30000);

    test('Indexer.runFunctions() should execute a test function against a given block using a full mutation to write to key-value storage', async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });
        const functions = {};
        functions['buildnear.testnet/itest1'] = {code: 'context.graphql(`mutation { insert_buildnear_testnet_itest1_indexer_storage_one(object: {function_name: "buildnear.testnet/itest3", key_name: "BlockHeight", value: "${block.header().height}"} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}}`);'};
        const block_height = 85376546;
        const mutations = await indexer.runFunctions(block_height, functions, {provision: true});
        expect(mutations[0]).toBeDefined()
        expect(JSON.stringify(mutations[0])).toContain("insert_buildnear_testnet_itest1_indexer_storage_one");
    }, 30000);

    /** Note that the on_conflict block in the mutation is for test repeatability.
     * The posts table has had its unique index dropped and replaced with a unique constraint
     * due to known Hasura issues with unique indexes vs unique constraints  */
    test('Indexer.runFunctions() should execute a near social function against a given block', async () => {

        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });
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
                            return functionCall.args.data[accountId].post
                                || functionCall.args.data[accountId].index;
                        })
                );
        if (nearSocialPosts.length > 0) {
            const blockHeight = block.blockHeight;
            const blockTimestamp = block.header().timestampNanosec;
            nearSocialPosts.forEach(postAction => {
                const accountId = Object.keys(postAction.args.data)[0];
                if (postAction.args.data[accountId].post && postAction.args.data[accountId].post.main) {
                    const postData = {account_id: accountId, block_height: blockHeight, block_timestamp: blockTimestamp,
                        receipt_id: postAction.receiptId, post: postAction.args.data[accountId].post.main
                        };
                    const mutationData = { post: { account_id: accountId, block_height: postData.block_height,
                      block_timestamp: postData.block_timestamp, receipt_id: postData.receipt_id, 
                      content: postData.post}};
                    context.graphql('mutation createPost($post:buildnear_testnet_test_posts_insert_input!) {' +  
                        'insert_buildnear_testnet_test_posts_one(object: $post on_conflict: {constraint: posts_pkey, update_columns: content}) { account_id, block_height } }',
                        mutationData);
                }
            });
        }`,
            schema: `create table posts (account_id text, block_height bigint, block_timestamp bigint, receipt_id text, content text, primary key (account_id, block_height));`
        };

        const block_height = 85242526; // post,  // 84940247; // comment
        const returnValue = await indexer.runFunctions(block_height, functions, {provision: true});

        console.log(returnValue);
        expect(returnValue.length).toEqual(1);
        expect(returnValue[0]).toContain("mutation createPost($post:buildnear_testnet_test_posts_insert_input!) {insert_buildnear_testnet_test_posts_one(object: $post on_conflict: {constraint: posts_pkey, update_columns: content}) { account_id, block_height } }");
    }, 30000);

    /** Note that the on_conflict block in the mutation is for test repeatability.
     * The comments table has had its unique index dropped and replaced with a unique constraint
     * due to known Hasura issues with unique indexes vs unique constraints  */
    // needs update to have schema
    test.skip('Indexer.runFunctions() should execute an imperative style near social function against a given block', async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });
        const functions = {};

        functions['buildnear.testnet/itest5'] = {code:`
            const { posts } = await context.graphql(\`
                query {
                    buildnear_testnet_itest5_posts(where: { id: { _eq: 2 } }) {
                        id
                    }
                }
            \`);

            if (posts.length === 0) {
                return;
            }

            const [post] = posts;

            const { insert_buildnear_testnet_itest5_comments: { returning: { id } } } = await context.graphql(\`
                mutation {
                    insert_buildnear_testnet_itest5_comments(
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
            '  buildnear_testnet_itest5_comments(where: {account_id: {_eq: "buildnear.testnet"}}) {\n' +
            '    id\n' +
            '    post_id\n' +
            '  }\n' +
            '}', {}, 'buildnear.testnet/itest5', '1234', 'append');
        expect(valueSet.comments[0].post_id).toEqual(2);
    });

    test("writeLog() should write a log to the database", async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });
        const id = await indexer.writeLog("buildnear.testnet/itest", 85376002, "test message");
        expect(id).toBeDefined();
        expect(id.length).toBe(36);
    });

    test("writeFunctionState should write a function state to the database", async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });
        const result = await indexer.writeFunctionState("buildnear.testnet/itest8", 85376002);
        expect(result).toBeDefined();
        expect(result.insert_indexer_state.returning[0].current_block_height).toBe(85376002);
    });

    // Errors are now exposed to the lambda hander. This test will be relevant again if this changes.
    test.skip ("function that throws an error should catch the error", async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {};
        functions['buildnear.testnet/test'] = {code:`
            throw new Error('boom');
        `};
        const block_height = 85376002;

        await indexer.runFunctions(block_height, functions);
        // no error thrown is success
    });

    // Errors are now exposed to the lambda hander. This test will be relevant again if this changes.
    test.skip("rejected graphql promise is awaited and caught", async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });

        const functions = {};
        functions['buildnear.testnet/itest3'] = {code:
                'await context.graphql(`mutation { incorrect_function_call()`);'};
        const block_height = 85376002;

        await indexer.runFunctions(block_height, functions, {imperative: true});
        // no error thrown is success
    });

    // Unreturned promise rejection seems to be uncatchable even with process.on('unhandledRejection'
    // However, the next function is run (in this test but not on Lambda).
    test.skip("function that rejects a promise should catch the error", async () => {
        const indexer = new Indexer('mainnet', { awsXray: mockAwsXray, metrics: mockMetrics });

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

