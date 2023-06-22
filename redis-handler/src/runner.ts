import fetch from 'node-fetch';
import { VM } from 'vm2';
import AWS from 'aws-sdk';
import { Block } from '@near-lake/primitives';

import Provisioner from './provisioner';

export default class Indexer {
    private DEFAULT_HASURA_ROLE: string;
    private network: string;

    private deps: {
        fetch: typeof fetch;
        s3: AWS.S3;
        provisioner: Provisioner;
    };

    constructor(network: string, deps?: { fetch: typeof fetch; s3: AWS.S3 }) {
        this.DEFAULT_HASURA_ROLE = 'append';
        this.network = network;
        this.deps = {
            fetch,
            s3: new AWS.S3({ region: process.env.REGION }),
            provisioner: new Provisioner(),
            ...deps,
        };
    }

    async runFunctions(
        block_height: number,
        functions: { [key: string]: any },
        options: { imperative: boolean; provision: boolean } = {
            imperative: false,
            provision: false,
        }
    ) {
        const blockWithHelpers = Block.fromStreamerMessage(
            await this.fetchStreamerMessage(block_height)
        );

        let lag =
            Date.now() -
            Math.floor(Number(blockWithHelpers.header().timestampNanosec) / 1000000);
        const simultaneousPromises = [];

        for (const function_name in functions) {
            try {
                const indexerFunction = functions[function_name];
                console.log(
                    'Running function',
                    function_name,
                    ', lag in ms is: ',
                    lag
                ); // Lambda logs
                simultaneousPromises.push(
                    this.writeLog(
                        function_name,
                        block_height,
                        'Running function',
                        function_name,
                        ', lag in ms is: ',
                        lag.toString()
                    )
                );

                const hasuraRoleName = function_name
                    .split('/')[0]
                    .replace(/[.-]/g, '_');
                const functionNameWithoutAccount = function_name
                    .split('/')[1]
                    .replace(/[.-]/g, '_');

                if (options.provision && !indexerFunction['provisioned']) {
                    const schemaName = `${function_name.replace(/[.\/-]/g, '_')}`;

                    try {
                        if (!(await this.deps.provisioner.doesEndpointExist(schemaName))) {
                            await this.setStatus(function_name, block_height, 'PROVISIONING');
                            simultaneousPromises.push(
                                this.writeLog(
                                    function_name,
                                    block_height,
                                    'Provisioning endpoint: starting'
                                )
                            );

                            await this.deps.provisioner.createAuthenticatedEndpoint(
                                schemaName,
                                hasuraRoleName,
                                indexerFunction.schema
                            );

                            simultaneousPromises.push(
                                this.writeLog(
                                    function_name,
                                    block_height,
                                    'Provisioning endpoint: successful'
                                )
                            );
                        }
                    } catch (err: any) {
                        simultaneousPromises.push(
                            this.writeLog(
                                function_name,
                                block_height,
                                'Provisioning endpoint: failure',
                                err.message
                            )
                        );
                        throw err;
                    }
                }

                await this.setStatus(function_name, block_height, 'RUNNING');

                const vm = new VM({ timeout: 3000, allowAsync: true });
                const mutationsReturnValue = {
                    mutations: [],
                    variables: {},
                    keysValues: {},
                };
                const context = options.imperative
                    ? this.buildImperativeContextForFunction(
                        function_name,
                        functionNameWithoutAccount,
                        block_height,
                        hasuraRoleName
                    )
                    : this.buildFunctionalContextForFunction(
                        mutationsReturnValue,
                        function_name,
                        block_height
                    );

                vm.freeze(blockWithHelpers, 'block');
                vm.freeze(context, 'context');
                vm.freeze(context, 'console'); // provide console.log via context.log
                vm.freeze(mutationsReturnValue, 'mutationsReturnValue'); // this still allows context.set to modify it

                const modifiedFunction = this.transformIndexerFunction(
                    indexerFunction.code
                );
                try {
                    await vm.run(modifiedFunction);
                } catch (e: any) {
                    // NOTE: logging the exception would likely leak some information about the index runner.
                    // For now, we just log the message. In the future we could sanitize the stack trace
                    // and give the correct line number offsets within the indexer function
                    console.error(
                        `${function_name}: Error running IndexerFunction on block ${block_height}: ${e.message}`
                    );
                    await this.writeLog(
                        function_name,
                        block_height,
                        'Error running IndexerFunction',
                        e.message
                    );
                    throw e;
                }

                if (!options.imperative) {
                    console.log(`Function ${function_name} returned`, mutationsReturnValue); // debug output
                    await this.writeMutations(
                        function_name,
                        functionNameWithoutAccount,
                        mutationsReturnValue,
                        block_height,
                        hasuraRoleName
                    ); // await can be dropped once it's all tested so writes can happen in parallel
                }

                simultaneousPromises.push(
                    this.writeFunctionState(function_name, block_height)
                );
            } catch (e) {
                console.error(`${function_name}: Failed to run function`, e);
                await this.setStatus(function_name, block_height, 'STOPPED');
                throw e;
            } finally {
                await Promise.all(simultaneousPromises);
            }
        }
    }

    buildKeyValueMutations(
        hasuraRoleName: string,
        functionNameWithoutAccount: string,
        keysValues: { [key: string]: any }
    ) {
        if (!keysValues || Object.keys(keysValues).length === 0) return '';
        return `mutation writeKeyValues($function_name: String!, ${Object.keys(
            keysValues
        )
            .map(
                (_key, index) => `$key_name${index}: String!, $value${index}: String!`
            )
            .join(', ')}) {
            ${Object.keys(keysValues)
                .map(
                    (_key, index) =>
                        `_${index}: insert_${hasuraRoleName}_${functionNameWithoutAccount}_indexer_storage_one(object: {function_name: $function_name, key_name: $key_name${index}, value: $value${index}} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}`
                )
                .join('\n')}
        }`;
    }
    buildKeyValueVariables(functionName: string, keysValues: { [key: string]: any }) {
        if (!keysValues || Object.keys(keysValues).length === 0) return {};
        return Object.keys(keysValues).reduce((acc, key, index) => {
            // @ts-ignore
            acc[`key_name${index}`] = key;
            // @ts-ignore
            acc[`value${index}`] = keysValues[key]
                ? JSON.stringify(keysValues[key])
                : null;
            return acc;
        }, { function_name: functionName });
    }
    async writeMutations(
        functionName: string,
        functionNameWithoutAccount: string,
        mutationsReturnValue: {
            mutations: string[];
            variables: { [key: string]: any };
            keysValues: { [key: string]: any };
        },
        block_height: number,
        hasuraRoleName: string
    ) {
        if (
            mutationsReturnValue?.mutations.length == 0 &&
            Object.keys(mutationsReturnValue?.keysValues).length == 0
        )
            return;
        try {
            const keyValuesMutations = this.buildKeyValueMutations(
                hasuraRoleName,
                functionNameWithoutAccount,
                mutationsReturnValue.keysValues
            );
            const allMutations = mutationsReturnValue.mutations.join('\n') + keyValuesMutations;
            const variablesPlusKeyValues = {
                ...mutationsReturnValue.variables,
                ...this.buildKeyValueVariables(functionName, mutationsReturnValue.keysValues),
            };

            console.log(
                'Writing mutations for function: ' + functionName,
                allMutations,
                variablesPlusKeyValues
            ); // debug output
            await this.runGraphQLQuery(
                allMutations,
                variablesPlusKeyValues,
                functionName,
                block_height,
                hasuraRoleName
            );

            return keyValuesMutations.length > 0
                ? mutationsReturnValue.mutations.concat(keyValuesMutations)
                : mutationsReturnValue.mutations;
        } catch (e) {
            console.error(`${functionName}: Failed to write mutations for function`, e);
        }
    }

    // pad with 0s to 12 digits
    normalizeBlockHeight(block_height: number) {
        return block_height.toString().padStart(12, '0');
    }

    async fetchStreamerMessage(block_height: number) {
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

    async fetchShardsPromises(block_height: number, number_of_shards: number) {
        return [
            ...Array(number_of_shards).keys()
        ].map((shard_id) => this.fetchShardPromise(block_height, shard_id));
    }

    fetchShardPromise(block_height: number, shard_id: number) {
        const params = {
            Bucket: `near-lake-data-${this.network}`,
            Key: `${this.normalizeBlockHeight(block_height)}/shard_${shard_id}.json`,
        };
        return this.deps.s3
            .getObject(params)
            .promise()
            .then((response: any) => {
                return JSON.parse(response.Body.toString(), (_key, value) =>
                    this.renameUnderscoreFieldsToCamelCase(value)
                );
            });
    }

    fetchBlockPromise(block_height: number) {
        const file = 'block.json';
        const folder = this.normalizeBlockHeight(block_height);
        const params = {
            Bucket: 'near-lake-data-' + this.network,
            Key: `${folder}/${file}`,
        };
        return this.deps.s3
            .getObject(params)
            .promise()
            .then((response: any) => {
                const block = JSON.parse(response.Body.toString(), (_key, value) =>
                    this.renameUnderscoreFieldsToCamelCase(value)
                );
                return block;
            });
    }

    enableAwaitTransform(indexerFunction: string): string {
        return `
        async function f(){
            ${indexerFunction}
        };
        f();
    `;
    }

    transformIndexerFunction(indexerFunction: string): string {
        return [
            this.enableAwaitTransform,
        ].reduce((acc, val) => val(acc), indexerFunction);
    }

    buildFunctionalContextForFunction(
        mutationsReturnValue: {
            mutations: string[];
            variables: { [key: string]: any };
            keysValues: { [key: string]: any };
        },
        functionName: string,
        block_height: number
    ): { graphql: Function; set: Function; log: Function } {
        return {
            graphql: (mutation: string, variables: { [key: string]: any }) => {
                mutationsReturnValue.mutations.push(mutation);
                // todo this is now a problem because multiple mutations could use the same variable names, but for now we're going to match the imperative context signature.
                mutationsReturnValue.variables = Object.assign(
                    mutationsReturnValue.variables,
                    variables
                );
            },
            set: (key: string, value: any) => {
                mutationsReturnValue.keysValues[key] = value;
            },
            log: async (log: string) => {
                return await this.writeLog(functionName, block_height, log);
            },
        };
    }

    buildImperativeContextForFunction(
        functionName: string,
        functionNameWithoutAccount: string,
        block_height: number,
        hasuraRoleName: string
    ) {
        return {
            graphql: async (operation: string, variables: { [key: string]: any }) => {
                try {
                    console.log(`${functionName}: Running context graphql`, operation); // temporary extra logging
                    return await this.runGraphQLQuery(
                        operation,
                        variables,
                        functionName,
                        block_height,
                        hasuraRoleName
                    );
                } catch (e) {
                    throw e; // allow catch outside of vm.run to receive the error
                }
            },
            set: async (key: string, value: any) => {
                const mutation = `mutation SetKeyValue($function_name: String!, $key: String!, $value: String!) {
                        insert_${hasuraRoleName}_${functionNameWithoutAccount}_indexer_storage_one(object: {function_name: $function_name, key_name: $key, value: $value} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}
                     }`;
                const variables = {
                    function_name: functionName,
                    key: key,
                    value: value ? JSON.stringify(value) : null,
                };
                try {
                    console.log(`${functionName}: Running set:`, mutation, variables); // temporary extra logging
                    return await this.runGraphQLQuery(
                        mutation,
                        variables,
                        functionName,
                        block_height,
                        hasuraRoleName
                    );
                } catch (e) {
                    throw e; // allow catch outside of vm.run to receive the error
                }
            },
            log: async (log: string) => {
                return await this.writeLog(functionName, block_height, log);
            },
        };
    }

    setStatus(
        functionName: string,
        blockHeight: number,
        status: string
    ): Promise<void> {
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
        ).finally(() => { });
    }

    async writeLog(
        function_name: string,
        block_height: number,
        ...message: string[]
    ) {
        const parsedMessage = message
            .map((m) => (typeof m === 'object' ? JSON.stringify(m) : m))
            .join(':');

        const mutation = `mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){
                insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {id}
             }`;

        return this.runGraphQLQuery(
            mutation,
            { function_name, block_height, message: parsedMessage },
            function_name,
            block_height,
            this.DEFAULT_HASURA_ROLE
        )
            .then((result) => {
                return result?.insert_indexer_log_entries_one?.id;
            })
            .catch((e) => {
                console.error(`${function_name}: Error writing log`, e);
            })
            .finally(() => { });
    }

    async writeFunctionState(function_name: string, block_height: number) {
        const mutation = `mutation WriteBlock($function_name: String!, $block_height: numeric!) {
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
        const variables = {
            function_name,
            block_height,
        };
        return this.runGraphQLQuery(
            mutation,
            variables,
            function_name,
            block_height,
            this.DEFAULT_HASURA_ROLE
        )
            .catch((e) => {
                console.error(`${function_name}: Error writing function state`, e);
            })
            .finally(() => { });
    }
    async runGraphQLQuery(
        operation: string,
        variables: { [key: string]: any },
        function_name: string,
        block_height: number,
        hasuraRoleName: string,
        logError = true
    ) {
        const response = await this.deps.fetch(
            `${process.env.HASURA_ENDPOINT}/v1/graphql`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(hasuraRoleName && { 'X-Hasura-Role': hasuraRoleName }),
                },
                body: JSON.stringify({
                    query: operation,
                    ...(variables && { variables }),
                }),
            }
        );

        // @ts-ignore
        const { data, errors } = await response.json();

        if (response.status !== 200 || errors) {
            if (logError) {
                console.log(`${function_name}: Error writing graphql `, errors); // temporary extra logging

                const message = errors
                    ? errors.map((e: any) => e.message).join(', ')
                    : `HTTP ${response.status} error writing with graphql to indexer storage`;
                const mutation = `mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){
                    insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {
                    id
                  }
                }`;
                try {
                    await this.runGraphQLQuery(
                        mutation,
                        { function_name, block_height, message },
                        function_name,
                        block_height,
                        this.DEFAULT_HASURA_ROLE,
                        false
                    );
                } catch (e) {
                    console.error(
                        `${function_name}: Error writing log of graphql error`,
                        e
                    );
                }
            }
            throw new Error(
                `Failed to write graphql, http status: ${response.status}, errors: ${JSON.stringify(
                    errors,
                    null,
                    2
                )}`
            );
        }

        return data;
    }

    renameUnderscoreFieldsToCamelCase(value: any): any {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            // It's a non-null, non-array object, create a replacement with the keys initially-capped
            const newValue = {};
            for (const key in value) {
                const newKey = key
                    .split('_')
                    .map((word, i) => {
                        if (i > 0) {
                            return word.charAt(0).toUpperCase() + word.slice(1);
                        }
                        return word;
                    })
                    .join('');
                // @ts-ignore
                newValue[newKey] = value[key];
            }
            return newValue;
        }
        return value;
    }
}
