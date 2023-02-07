import { connect } from "near-api-js";
import { VM } from 'vm2';
import AWS from 'aws-sdk';

export default class Indexer {

    constructor(
        network,
        aws_region,
        deps
    ) {
        this.network = network;
        this.aws_region = aws_region;
        this.deps = {
            fetch,
            s3: new AWS.S3({ region: aws_region }),
            ...deps,
        };
    }

    async runFunctions(block, functions) {

        const allMutations = {}; // track output for tests and logging

        const blockWithHelpers = this.addHelperFunctionsToBlock(block);

        // TODO only execute function specified in AlertMessage - blocked on filtering changes
        for (const key in functions) {
            console.log('Running function', functions[key]);  // debug output
            try {
                const vm = new VM();
                const mutationsReturnValue = {};
                const context = this.buildFunctionalContextForFunction(key, mutationsReturnValue);
                //const context = this.buildImperativeContextForFunction(key, vm);

                vm.freeze(blockWithHelpers, 'block');
                vm.freeze(context, 'context');
                vm.freeze(mutationsReturnValue, 'mutationsReturnValue'); // this still allows context.set to modify it

                const modifiedFunction = this.transformIndexerFunction(functions[key]);
                vm.run(modifiedFunction);

                console.log(`Function ${key} returned`, mutationsReturnValue); // debug output
                const graphqlMutationList = await this.writeMutations(key, mutationsReturnValue); // await can be dropped once it's all tested so writes can happen in parallel
                allMutations[key] = graphqlMutationList;
            } catch (e) {
                console.error('Failed to run function: ' + key);
                console.error(e);
            }
        }
        return allMutations;
    }

    // TODO use new GraphQL structure if schema is present
    async writeMutations(functionName, mutations) {
        const mutationList = [];
        try {
            for (const key in mutations) {
                // Build graphQL mutation from key value pairs. example:
                // mutation {
                //   set(functionName:"buildnear.testnet/test", key: "1", data: "What's up now Elon?" )
                // }
                const mutation = `mutation { set(functionName: \"${functionName}\", key: \"${key}\", data: \"${mutations[key]}\") }`;

                // Post mutation to graphQL endpoint
                const response = await this.deps.fetch('https://query-api-graphql-vcqilefdcq-uc.a.run.app/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query: mutation }),
                });

                const responseJson = await response.json();
                if(response.status !== 200 || responseJson.errors) {
                    console.error('Failed to write mutation for function: ' + functionName +
                        ' http status: ' + response.status, responseJson.errors);
                } else {
                    mutationList.push(mutation);
                }
            }
        } catch (e) {
            console.error('Failed to write mutations for function: ' + functionName);
            console.error(e);
        }
        return mutationList;
    }

    async fetchIndexerFunctions() {
        const connectionConfig = {
            networkId: "testnet",
            // keyStore: myKeyStore, // no keystore needed for reads
            nodeUrl: "https://rpc.testnet.near.org",
            walletUrl: "https://wallet.testnet.near.org",
            helperUrl: "https://helper.testnet.near.org",
            explorerUrl: "https://explorer.testnet.near.org",
        };
        const near = await connect(connectionConfig);
        const response = await near.connection.provider.query({
            request_type: "call_function",
            finality: "optimistic",
            account_id: "registry.queryapi.testnet",
            method_name: "list_indexer_functions",
            args_base64: "",
        });

        const stringResult = Buffer.from(response.result).toString();
        const functions = JSON.parse(stringResult);
        return functions;
    }

    // TODO fetch chunks as well
    // fetch block from S3 based on block_height
    async fetchBlock(block_height) {
        const file = 'block.json';
        const folder = block_height.toString().padStart(12, '0'); // pad with 0s to 12 digits
        const params = {
            Bucket: 'near-lake-data-' + this.network,
            Key: `${folder}/${file}`,
        };
        const response = await this.deps.s3.getObject(params).promise();
        const block = JSON.parse(response.Body.toString());
        return block;
    }

    // no transformations yet to the developer supplied code
    transformIndexerFunction(indexerFunction) {
        return indexerFunction;
    }

    // TODO Implement
    addHelperFunctionsToBlock(block) {
        return block;
    }

    buildFunctionalContextForFunction(key, mutationsReturnValue) {
        const context = {};
        context.set = function (key, value) {
            mutationsReturnValue[key] = value
        };
        return context;
    }

    // TODO Implement
    buildImperativeContextForFunction(key, vm) {
        const context = {};

        // TODO require fetch library (or prisma) in VM to allow implementation of imperative version

        return context;
    }
}