import Indexer from "./indexer.js";

export const consumer = async (event) => {
    const indexer = new Indexer('mainnet', 'us-west-2');

    const results = []; // batch size should be 1 but we process all records anyway
    for (const record of event.Records) {
        try {
            const jsonBody = JSON.parse(record.body);
            const block_height = jsonBody.block_height;
            const function_name = jsonBody.function_name;
            const function_config = jsonBody.function_code;
            const functions = {};
            functions[function_name] = JSON.parse(function_config);
            const mutations = await indexer.runFunctions(block_height, functions, {imperative: false});
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
