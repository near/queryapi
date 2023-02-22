import Indexer from './indexer';

describe('Indexer', () => {

    test('Indexer.runFunctions() should execute a test function against a given block using key-value storage', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};
        functions['buildnear.testnet/test'] = {code: 'context.set("BlockHeight", block.header().height);'};
        const block_height = 85376546;
        const mutations = await indexer.runFunctions(block_height, functions);
        expect(mutations).toEqual({"keyvalues": {"BlockHeight": 85376546}, "mutations": [], "variables": {}});
    });

    test('Indexer.runFunctions() should execute a test function against a given block using a full mutation to write to key-value storage', async () => {
        const indexer = new Indexer('mainnet', 'us-west-2');
        const functions = {};
        functions['buildnear.testnet/test'] = {code: 'context.graphql.mutation(`mutation { insert_indexer_storage_one(object: {function_name: "buildnear.testnet/itest1", key_name: "BlockHeight", value: "${block.header().height}"} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}}`);'};
        const block_height = 85376546;
        const mutations = await indexer.runFunctions(block_height, functions);
        expect(mutations).toBeDefined()
        expect(JSON.stringify(mutations)).toContain("insert_indexer_storage_one");
    });

    /** Note that the on_conflict block in the mutation is for test repeatability, there are known Hasura issues with unique indexes vs unique constraints on tables  */
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
                    context.graphql.mutation('mutation createPost($post:posts_insert_input!) { insert_posts_one(object: $post on_conflict: {constraint: posts_account_id_block_height_key, update_columns: content}) { id } }');
                    context.graphql.allVariables(mutationData);
                }
            });
        }
`       };

        const block_height = 85242526; // post,  // 84940247; // comment
        const returnValue = await indexer.runFunctions(block_height, functions);

        expect(returnValue.mutations.length).toEqual(1);
        expect(returnValue.mutations[0]).toContain("mutation createPost($post:posts_insert_input!) { insert_posts_one(object: $post) { id } }");
    });
});

