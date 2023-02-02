import { connect, keyStores, WalletConnection } from "near-api-js";
import { VM } from 'vm2';

export default class Indexer {
    // TODO require fetch library in VM to allow implementation of imperative version
    async run() {
        const functions = await this.fetchIndexerFunctions();

        // TODO parse SQS message

        // TODO fetch block from S3 based on block_height

        const block = {block: {height: 456}}; // mockblock

        // TODO only execute function specified in AlertMessage

        // execute each indexer function against the current block
        await this.runFunctions(block, functions);

    }

    async runFunctions(block, functions) {

        const allMutations = {}; // track output for tests and logging

        for (const key in functions) {
            console.log(functions[key]);  // debug output
            try {
                const vm = new VM();
                const context = {};
                const mutationsReturnValue = {};
                context.set = function (key, value) {
                    mutationsReturnValue[key] = value
                };
                vm.freeze(block, 'streamerMessage');
                vm.freeze(context, 'context');
                vm.freeze(mutationsReturnValue, 'mutationsReturnValue'); // this still allows context.set to modify it

                const modifiedFunction = functions[key]; // no transformations yet to the developer supplied code
                vm.run(modifiedFunction);

                console.log(mutationsReturnValue); // debug output
                const graphqlMutationList = await this.writeMutations(key, mutationsReturnValue); // await can be dropped once it's all tested so writes can happen in parallel
                allMutations[key] = graphqlMutationList;
            } catch (e) {
                console.error('Failed to run function: ' + key);
                console.error(e);
            }
        }
        return allMutations;
    }

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
                const response = await fetch('https://query-api-graphql-vcqilefdcq-uc.a.run.app/graphql', {
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
}