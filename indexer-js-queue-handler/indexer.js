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

    async runFunctions(block_height, functions, options = { imperative: false }) {
        const blockWithHelpers = Block.fromStreamerMessage(await this.fetchStreamerMessage(block_height));

        // TODO only execute function(s) specified in AlertMessage - blocked on filtering changes
        for (const function_name in functions) {
            // console.log('Running function', functions[function_name]);  // debug output
            try {
                const vm = new VM();
                const mutationsReturnValue = {mutations: [], variables: {}, keyvalues: {}};
                const context = options.imperative
                    ? this.buildImperativeContextForFunction()
                    : this.buildFunctionalContextForFunction(mutationsReturnValue);

                vm.freeze(blockWithHelpers, 'block');
                vm.freeze(context, 'context');
                vm.freeze(mutationsReturnValue, 'mutationsReturnValue'); // this still allows context.set to modify it

                const modifiedFunction = this.transformIndexerFunction(functions[function_name].code);
                await vm.run(modifiedFunction);

                if (!options.imperative) {
                    console.log(`Function ${function_name} returned`, mutationsReturnValue); // debug output
                    await this.writeMutations(function_name, mutationsReturnValue); // await can be dropped once it's all tested so writes can happen in parallel
                }
                return mutationsReturnValue;
            } catch (e) {
                console.error('Failed to run function: ' + function_name, e);
            }
        }
    }

    buildKeyValueMutations(keyvalues) {
        if(!keyvalues || Object.keys(keyvalues).length === 0) return '';
        return `mutation writeKeyValues($function_name: String!, ${Object.keys(keyvalues).map((key, index) => `$key_name${index}: String!, $value${index}: String!`).join(', ')}) {
            ${Object.keys(keyvalues).map((key, index) => `_${index}: insert_indexer_storage_one(object: {function_name: $function_name, key_name: $key_name${index}, value: $value${index}} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}`).join('\n')}
        }`;
    }
    buildKeyValueVariables(functionName, keyvalues) {
        if(!keyvalues || Object.keys(keyvalues).length === 0) return {};
        return Object.keys(keyvalues).reduce((acc, key, index) => {
            acc[`key_name${index}`] = key;
            acc[`value${index}`] = keyvalues[key] ? JSON.stringify(keyvalues[key]) : null;
            return acc;
        }, {function_name: functionName});
    }
    async writeMutations(functionName, mutationReturnValue) {
        try {
            const allMutations = mutationReturnValue.mutations.join('\n') + this.buildKeyValueMutations(mutationReturnValue.keyvalues);
            const variablesPlusKeyValues = {...mutationReturnValue.variables, ...this.buildKeyValueVariables(functionName, mutationReturnValue.keyvalues)};

            console.log('Writing mutations for function: ' + functionName, allMutations, variablesPlusKeyValues); // debug output

            const response = await this.deps.fetch(process.env.GRAPHQL_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: allMutations, variables: variablesPlusKeyValues }),
            });

            const responseJson = await response.json();
            if(response.status !== 200 || responseJson.errors) {
                throw new Error(`Failed to write mutation for function: ${functionName}, http status: ${response.status}, errors: ${JSON.stringify(responseJson.errors)}`);
            }
            return allMutations;
        } catch (e) {
            console.error('Failed to write mutations for function: ' + functionName, e);
            throw(e);
        }
    }

    async fetchIndexerFunctions() {
        const connectionConfig = {
            networkId: "mainnet",
            // keyStore: myKeyStore, // no keystore needed for reads
            nodeUrl: "https://rpc.mainnet.near.org",
            walletUrl: "https://wallet.mainnet.near.org",
            helperUrl: "https://helper.mainnet.near.org",
            explorerUrl: "https://explorer.mainnet.near.org",
        };
        const near = await connect(connectionConfig);
        const response = await near.connection.provider.query({
            request_type: "call_function",
            finality: "optimistic",
            account_id: "registry.queryapi.near",
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
        return JSON.parse(response.Body.toString(), (key, value) => this.renameUnderscoreFieldsToCamelCase(value));
    }

    async fetchBlock(block_height) {
        const file = 'block.json';
        const folder = this.normalizeBlockHeight(block_height);
        const params = {
            Bucket: 'near-lake-data-' + this.network,
            Key: `${folder}/${file}`,
        };
        const response = await this.deps.s3.getObject(params).promise();
        const block = JSON.parse(response.Body.toString(), (key, value) => this.renameUnderscoreFieldsToCamelCase(value));
        return block;
    }

    enableAwaitTransform(indexerFunction) {
        return `
            (async () => {
                ${indexerFunction}
            })();
        `;
    }

    transformIndexerFunction(indexerFunction) {
        return [
            this.enableAwaitTransform,
        ].reduce((acc, val) => val(acc), indexerFunction);
    }

    buildFunctionalContextForFunction(mutationsReturnValue) {
        return {
            graphql: {
                mutation(mutation) {
                    mutationsReturnValue.mutations.push(mutation);
                },
                allVariables(variables) {
                    mutationsReturnValue.variables = variables;
                }
            },
            set: (key, value) => {
                mutationsReturnValue.keyvalues[key] = value;
            }
        };
    }

    buildImperativeContextForFunction() {
        return {
            graphql: async (operation, variables) => {
                const response = await this.deps.fetch(process.env.GRAPHQL_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        query: operation,
                        ...(variables && { variables }),
                    }),
                });

                const { data, errors } = await response.json();

                if (response.status !== 200 || errors) {
                    throw new Error(JSON.stringify(errors,  null, 2));
                }

                return data;
            }
        }
    }
    renameUnderscoreFieldsToCamelCase(value) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            // It's a non-null, non-array object, create a replacement with the keys initially-capped
            const newValue = {};
            for (const key in value) {
                const newKey = key
                    .split("_")
                    .map((word, i) => {
                        if (i > 0) {
                            return word.charAt(0).toUpperCase() + word.slice(1);
                        }
                        return word;
                    })
                    .join("");
                newValue[newKey] = value[key];
            }
            return newValue;
        }
        return value;
    }
}
