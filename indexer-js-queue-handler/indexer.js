import { connect } from "near-api-js";
import { VM } from 'vm2';
import AWS from 'aws-sdk';
import { Block } from '@near-lake/primitives'

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

    async runFunctions(block_height, functions) {
        const blockWithHelpers = Block.fromStreamerMessage(await this.fetchStreamerMessage(block_height));

        // TODO only execute function specified in AlertMessage - blocked on filtering changes
        for (const key in functions) {
            console.log('Running function', functions[key]);  // debug output
            try {
                const vm = new VM();
                const mutationsReturnValue = [];
                const context = this.buildFunctionalContextForFunction(key, mutationsReturnValue);
                //const context = this.buildImperativeContextForFunction(key, vm);

                vm.freeze(blockWithHelpers, 'block');
                vm.freeze(context, 'context');
                vm.freeze(mutationsReturnValue, 'mutationsReturnValue'); // this still allows context.set to modify it

                const modifiedFunction = this.transformIndexerFunction(functions[key]);
                vm.run(modifiedFunction);

                console.log(`Function ${key} returned`, mutationsReturnValue); // debug output
                await this.writeMutations(key, mutationsReturnValue); // await can be dropped once it's all tested so writes can happen in parallel
            } catch (e) {
                console.error('Failed to run function: ' + key);
                console.error(e);
            }
        }
    }

    buildBatchedMutation(mutations) {
        return `mutation {
${
    mutations
        // alias each mutation to avoid conflicts between duplicate fields
        .map((mutation, index) => `_${index}: ${mutation}`)
        .join('\n')
}
}`;
    }

    async writeMutations(functionName, mutations) {
        try {
            const response = await this.deps.fetch('https://query-api-graphql-vcqilefdcq-uc.a.run.app/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: this.buildBatchedMutation(mutations) }),
            });

            const responseJson = await response.json();
            if(response.status !== 200 || responseJson.errors) {
                throw new Error(`Failed to write mutation for function: ${functionName}, http status: ${response.status}, errors: ${JSON.stringify(responseJson.errors)}`);
            }
        } catch (e) {
            console.error('Failed to write mutations for function: ' + functionName);
            throw(e);
        }
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

    normalizeBlockHeight(block_height) {
        return block_height.toString().padStart(12, '0'); // pad with 0s to 12 digits
    }

    async fetchStreamerMessage(block_height) {
        const block = await this.fetchBlock(block_height);
        const shards = await this.fetchShards(block_height, block.chunks.length)

        return {
            block,
            shards,
        };
    }    

    async fetchShards(block_height, number_of_shards) {
        return Promise.all(
            [...Array(number_of_shards).keys()].map((shard_id) => this.fetchShard(block_height, shard_id))
        )
    }

    async fetchShard(block_height, shard_id) {
        const params = {
            Bucket: `near-lake-data-${this.network}`,
            Key: `${this.normalizeBlockHeight(block_height)}/shard_${shard_id}.json`,
        };
        const response = await this.deps.s3.getObject(params).promise();
        return JSON.parse(response.Body.toString());
    }

    async fetchBlock(block_height) {
        const file = 'block.json';
        const folder = this.normalizeBlockHeight(block_height);
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

    buildFunctionalContextForFunction(key, mutationsReturnValue) {
        return {
            graphql: {
                mutation(mutation) {
                    mutationsReturnValue.push(mutation);
                },
            },
        };
    }

    // TODO Implement
    buildImperativeContextForFunction(key, vm) {
        const context = {};

        // TODO require fetch library (or prisma) in VM to allow implementation of imperative version

        return context;
    }
}
