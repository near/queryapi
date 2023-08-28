import { connect } from "near-api-js";
import fetch from 'node-fetch';
import { VM } from 'vm2';
import AWS from 'aws-sdk';
import { Block } from '@near-lake/primitives'

import Provisioner from './provisioner.js'
import AWSXRay from "aws-xray-sdk";
import traceFetch from "./trace-fetch.js";
import Metrics from './metrics.js'

export default class Indexer {

    DEFAULT_HASURA_ROLE;

    constructor(
        network,
        deps
    ) {
        this.DEFAULT_HASURA_ROLE = 'append';
        this.network = network;
        this.aws_region = process.env.REGION;
        this.deps = {
            fetch: traceFetch(fetch),
            s3: new AWS.S3({ region: process.env.REGION }),
            metrics: new Metrics('QueryAPI'),
            provisioner: new Provisioner(),
            awsXray: AWSXRay,
            ...deps,
        };
    }

    async runFunctions(block_height, functions, is_historical, options = { imperative: false, provision: false }) {
        const blockWithHelpers = Block.fromStreamerMessage(await this.fetchStreamerMessage(block_height));

        let lag = Date.now() - Math.floor(blockWithHelpers.header().timestampNanosec / 1000000);
        const simultaneousPromises = [];
        const allMutations = [];
        for (const function_name in functions) {
            try {
                const indexerFunction = functions[function_name];
                const runningMessage = `Running function ${function_name}` +  (is_historical ? ' historical backfill' : `, lag is: ${lag?.toString()}ms from block timestamp`);
                console.log(runningMessage);  // Lambda logs
                const segment = this.deps.awsXray.getSegment(); // segment is immutable, subsegments are mutable
                const functionSubsegment = segment.addNewSubsegment('indexer_function');
                functionSubsegment.addAnnotation('indexer_function', function_name);
                simultaneousPromises.push(this.writeLog(function_name, block_height, runningMessage));

                simultaneousPromises.push(this.deps.metrics.putBlockHeight(indexerFunction.account_id, indexerFunction.function_name, is_historical, block_height));

                const hasuraRoleName = function_name.split('/')[0].replace(/[.-]/g, '_');
                const functionNameWithoutAccount = function_name.split('/')[1].replace(/[.-]/g, '_');

                if (options.provision && !indexerFunction["provisioned"]) {
                    try {
                        if (!await this.deps.provisioner.isUserApiProvisioned(indexerFunction.account_id, indexerFunction.function_name)) {
                            await this.setStatus(function_name, block_height, 'PROVISIONING');
                            simultaneousPromises.push(this.writeLog(function_name, block_height, 'Provisioning endpoint: starting'));

                            await this.deps.provisioner.provisionUserApi(indexerFunction.account_id, indexerFunction.function_name, indexerFunction.schema);

                            simultaneousPromises.push(this.writeLog(function_name, block_height, 'Provisioning endpoint: successful'));
                        }
                    } catch (err) {
                        simultaneousPromises.push(this.writeLog(function_name, block_height, 'Provisioning endpoint: failure', err.message));
                        throw err;
                    }
                }

                await this.setStatus(function_name, block_height, 'RUNNING');

                const vm = new VM({timeout: 3000, allowAsync: true});
                const mutationsReturnValue = {mutations: [], variables: {}, keysValues: {}};
                const context = options.imperative
                    ? this.buildImperativeContextForFunction(function_name, functionNameWithoutAccount, block_height, hasuraRoleName, is_historical)
                    : this.buildFunctionalContextForFunction(mutationsReturnValue, function_name, block_height);

                vm.freeze(blockWithHelpers, 'block');
                vm.freeze(context, 'context');
                vm.freeze(context, 'console'); // provide console.log via context.log
                vm.freeze(mutationsReturnValue, 'mutationsReturnValue'); // this still allows context.set to modify it

                const modifiedFunction = this.transformIndexerFunction(indexerFunction.code);
                try {
                    await vm.run(modifiedFunction);
                } catch (e) {
                    // NOTE: logging the exception would likely leak some information about the index runner.
                    // For now, we just log the message. In the future we could sanitize the stack trace
                    // and give the correct line number offsets within the indexer function
                    console.error(`${function_name}: Error running IndexerFunction on block ${block_height}: ${e.message}`);
                    await this.writeLog(function_name, block_height, 'Error running IndexerFunction', e.message);
                    throw e;
                }

                if (!options.imperative) {
                    console.log(`Function ${function_name} returned`, mutationsReturnValue); // debug output
                    const writtenMutations = await this.writeMutations(function_name, functionNameWithoutAccount, mutationsReturnValue, block_height, hasuraRoleName); // await can be dropped once it's all tested so writes can happen in parallel
                    if(writtenMutations?.length > 0) {
                        allMutations.push(...writtenMutations);
                    }
                }

                simultaneousPromises.push(this.writeFunctionState(function_name, block_height, is_historical));
            } catch (e) {
                console.error(`${function_name}: Failed to run function`, e);
                this.deps.awsXray.resolveSegment().addError(e);
                await this.setStatus(function_name, block_height, 'STOPPED');
                throw e;
            } finally {
                await Promise.all(simultaneousPromises);
                this.deps.awsXray.resolveSegment().close();
            }
        }
        return allMutations;
    }

    buildKeyValueMutations(hasuraRoleName, functionNameWithoutAccount, keysValues) {
        if(!keysValues || Object.keys(keysValues).length === 0) return '';
        return `mutation writeKeyValues($function_name: String!, ${Object.keys(keysValues).map((key, index) => `$key_name${index}: String!, $value${index}: String!`).join(', ')}) {
            ${Object.keys(keysValues).map((key, index) => `_${index}: insert_${hasuraRoleName}_${functionNameWithoutAccount}_indexer_storage_one(object: {function_name: $function_name, key_name: $key_name${index}, value: $value${index}} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}`).join('\n')}
        }`;
    }
    buildKeyValueVariables(functionName, keysValues) {
        if(!keysValues || Object.keys(keysValues).length === 0) return {};
        return Object.keys(keysValues).reduce((acc, key, index) => {
            acc[`key_name${index}`] = key;
            acc[`value${index}`] = keysValues[key] ? JSON.stringify(keysValues[key]) : null;
            return acc;
        }, {function_name: functionName});
    }
    async writeMutations(functionName, functionNameWithoutAccount, mutationsReturnValue, block_height, hasuraRoleName) {
        if(mutationsReturnValue?.mutations.length == 0 && Object.keys(mutationsReturnValue?.keysValues).length == 0) return;
        try {
            const keyValuesMutations = this.buildKeyValueMutations(hasuraRoleName, functionNameWithoutAccount, mutationsReturnValue.keysValues);
            const allMutations = mutationsReturnValue.mutations.join('\n') + keyValuesMutations;
            const variablesPlusKeyValues = {...mutationsReturnValue.variables, ...this.buildKeyValueVariables(functionName, mutationsReturnValue.keysValues)};

            console.log('Writing mutations for function: ' + functionName, allMutations, variablesPlusKeyValues); // debug output
            await this.runGraphQLQuery(allMutations, variablesPlusKeyValues, functionName, block_height, hasuraRoleName);

            return keyValuesMutations.length > 0 ? mutationsReturnValue.mutations.concat(keyValuesMutations) : mutationsReturnValue.mutations;
        } catch (e) {
            console.error(`${functionName}: Failed to write mutations for function`, e);
        }
    }

    // pad with 0s to 12 digits
    normalizeBlockHeight(block_height) {
        return block_height.toString().padStart(12, '0');
    }

    async fetchStreamerMessage(block_height) {
        const blockPromise = this.fetchBlockPromise(block_height);
        // hardcoding 4 shards to test performance
        const shardsPromises = await this.fetchShardsPromises(block_height, 4); // block.chunks.length)

        const results = await Promise.all([blockPromise, ...shardsPromises]);
        const block = results.shift();
        const shards = results;
        return {
            block: block,
            shards: shards,
        };
    }    

    async fetchShardsPromises(block_height, number_of_shards) {
        return ([...Array(number_of_shards).keys()].map((shard_id) =>
            this.fetchShardPromise(block_height, shard_id)));
    }

    fetchShardPromise(block_height, shard_id) {
        const params = {
            Bucket: `near-lake-data-${this.network}`,
            Key: `${this.normalizeBlockHeight(block_height)}/shard_${shard_id}.json`,
        };
        return this.deps.s3.getObject(params).promise().then((response) => {
            return JSON.parse(response.Body.toString(), (key, value) => this.renameUnderscoreFieldsToCamelCase(value));
        });
    }

    fetchBlockPromise(block_height) {
        const file = 'block.json';
        const folder = this.normalizeBlockHeight(block_height);
        const params = {
            Bucket: 'near-lake-data-' + this.network,
            Key: `${folder}/${file}`,
        };
        return this.deps.s3.getObject(params).promise().then((response) => {
            const block = JSON.parse(response.Body.toString(), (key, value) => this.renameUnderscoreFieldsToCamelCase(value));
            return block;
        });
    }

    enableAwaitTransform(indexerFunction) {
        return `
            async function f(){
                ${indexerFunction}
            };
            f();
        `;
    }

    transformIndexerFunction(indexerFunction) {
        return [
            this.enableAwaitTransform,
        ].reduce((acc, val) => val(acc), indexerFunction);
    }

    buildFunctionalContextForFunction(mutationsReturnValue, functionName, block_height) {
        return {
            graphql: (mutation, variables) => {
                mutationsReturnValue.mutations.push(mutation);
                // todo this is now a problem because multiple mutations could use the same variable names, but for now we're going to match the imperative context signature.
                mutationsReturnValue.variables = Object.assign(mutationsReturnValue.variables, variables);
            },
            set: (key, value) => {
                mutationsReturnValue.keysValues[key] = value;
            },
            log: async (...log) => {  // starting with imperative logging for both imperative and functional contexts
                return await this.writeLog(functionName, block_height, ...log);
            },
        };
    }

    buildImperativeContextForFunction(functionName, functionNameWithoutAccount,  block_height, hasuraRoleName, is_historical) {
        return {
            graphql: async (operation, variables) => {
                try {
                    console.log(`${functionName}: Running context graphql`, operation); // temporary extra logging
                    return await this.runGraphQLQuery(operation, variables, functionName, block_height, hasuraRoleName);
                } catch (e) {
                    throw e; // allow catch outside of vm.run to receive the error
                }
            },
            set: async (key, value) => {
                const mutation =
                    `mutation SetKeyValue($function_name: String!, $key: String!, $value: String!) {
                        insert_${hasuraRoleName}_${functionNameWithoutAccount}_indexer_storage_one(object: {function_name: $function_name, key_name: $key, value: $value} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}
                     }`
                const variables = {
                    function_name: functionName,
                    key: key,
                    value: value ? JSON.stringify(value) : null
                };
                try {
                    console.log(`${functionName}: Running set:`, mutation, variables); // temporary extra logging
                    return await this.runGraphQLQuery(mutation, variables, functionName, block_height, hasuraRoleName);
                } catch (e) {
                    throw e; // allow catch outside of vm.run to receive the error
                }
            },
            log: async (...log) => {
                return await this.writeLog(functionName, block_height, ...log);
            },
            putMetric: (name, value) => {
                const [accountId, fnName] = functionName.split('/');
                return this.deps.metrics.putCustomMetric(
                    accountId,
                    fnName,
                    is_historical,
                    `CUSTOM_${name}`,
                    value
                );
            },
            fetchFromSocialApi: async (path, options) => {
                return this.deps.fetch(`https://api.near.social${path}`, options);
            }
        };
    }

    setStatus(functionName, blockHeight, status) {
        const activeFunctionSubsegment = this.deps.awsXray.resolveSegment()
        const subsegment = activeFunctionSubsegment.addNewSubsegment(`setStatus`);

        return this.runGraphQLQuery(
            `
                mutation SetStatus($function_name: String, $status: String) {
                  insert_indexer_state_one(object: {function_name: $function_name, status: $status, current_block_height: 0 }, on_conflict: { constraint: indexer_state_pkey, update_columns: status }) {
                    function_name
                    status
                  }
                }
            `,
            {
                function_name: functionName,
                status,
            },
            functionName,
            blockHeight,
            this.DEFAULT_HASURA_ROLE
        ).finally(() => {
            subsegment.close();
        });
    }

    async writeLog(function_name, block_height, ...message) { // accepts multiple arguments
        const activeFunctionSubsegment = this.deps.awsXray.resolveSegment();
        const subsegment = activeFunctionSubsegment.addNewSubsegment(`writeLog`);
        const parsedMessage = message
            .map(m => typeof m === 'object' ? JSON.stringify(m) : m)
            .join(':');

        const mutation =
            `mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){
                insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {id}
             }`;

        return this.runGraphQLQuery(mutation, {function_name, block_height, message: parsedMessage},
            function_name, block_height, this.DEFAULT_HASURA_ROLE)
            .then((result) => {
                return result?.insert_indexer_log_entries_one?.id;
            })
            .catch((e) => {
                console.error(`${function_name}: Error writing log`, e);
            })
            .finally(() => {
                subsegment.close();
            });
    }

    async writeFunctionState(function_name, block_height, is_historical) {
        const activeFunctionSubsegment = this.deps.awsXray.resolveSegment();
        const subsegment = activeFunctionSubsegment.addNewSubsegment(`writeFunctionState`);
        const real_time_mutation =
            `mutation WriteBlock($function_name: String!, $block_height: numeric!) {
                  insert_indexer_state(
                    objects: {current_block_height: $block_height, function_name: $function_name}
                    on_conflict: {constraint: indexer_state_pkey, update_columns: current_block_height}
                  ) {
                    returning {
                      current_block_height
                      function_name
                    }
                  }
                }`;
        const historical_mutation = `
            mutation WriteBlock($function_name: String!, $block_height: numeric!) {
              insert_indexer_state(
                objects: {current_historical_block_height: $block_height, current_block_height: 0, function_name: $function_name}
                on_conflict: {constraint: indexer_state_pkey, update_columns: current_historical_block_height}
              ) {
                returning {
                  current_block_height
                  current_historical_block_height
                  function_name
                }
              }
            }
        `;
        const variables = {
            function_name,
            block_height,
        };
        return this.runGraphQLQuery(is_historical ? historical_mutation : real_time_mutation, variables, function_name, block_height, this.DEFAULT_HASURA_ROLE)
            .catch((e) => {
                console.error(`${function_name}: Error writing function state`, e);
            })
            .finally(() => {
                subsegment.close();
            });
    }

    async runGraphQLQuery(operation, variables, function_name, block_height, hasuraRoleName, logError = true) {
        const response = await this.deps.fetch(`${process.env.HASURA_ENDPOINT}/v1/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Hasura-Use-Backend-Only-Permissions': 'true',
                ...(hasuraRoleName && {
                        'X-Hasura-Role': hasuraRoleName,
                        'X-Hasura-Admin-Secret': process.env.HASURA_ADMIN_SECRET
                    }
                ),
            },
            body: JSON.stringify({
                query: operation,
                ...(variables && {variables}),
            }),
        });

        const {data, errors} = await response.json();

        if (response.status !== 200 || errors) {
            if(logError) {
                console.log(`${function_name}: Error writing graphql `, errors); // temporary extra logging
                this.deps.awsXray.resolveSegment().addAnnotation('graphql_errors', true);

                const message = errors ? errors.map((e) => e.message).join(', ') : `HTTP ${response.status} error writing with graphql to indexer storage`;
                const mutation =
                    `mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){
                    insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {
                    id
                  }
                }`;
                try {
                    await this.runGraphQLQuery(mutation, {function_name, block_height, message}, function_name, block_height, this.DEFAULT_HASURA_ROLE, false);
                } catch (e) {
                    console.error(`${function_name}: Error writing log of graphql error`, e);
                }
            }
            throw new Error(`Failed to write graphql, http status: ${response.status}, errors: ${JSON.stringify(errors, null, 2)}`);
        }

        return data;
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
