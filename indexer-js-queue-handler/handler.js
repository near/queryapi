import Indexer from "./indexer.js";

export const consumer = async (event) => {
    const indexer = new Indexer('mainnet', 'eu-central-1');

    const results = []; // batch size should be 1 but we process all records anyway
    for (const record of event.Records) {
        try {
            const jsonBody = JSON.parse(record.body);
            const block_height = jsonBody.block_height;
            const functions = {};

            const function_config = jsonBody.indexer_function;
            const function_name = function_config.account_id + '/' + function_config.function_name;
            functions[function_name] = function_config;

            const mutations = await indexer.runFunctions(block_height, functions, {imperative: true, provision: true});
            results.push(...mutations);
        } catch (error) {
            return { // force DLQ treatment of batch by returning error
                statusCode: 400,
                body: JSON.stringify({
                    message: error,
                }),
            };

        }
    }
    return {statusCode: 200, body: {"# of mutations applied": results.length}}
};
