import Indexer from "./indexer.js";
import AWSXRay from "aws-xray-sdk";
import AWS from "aws-sdk";

// capture calls to AWS services in X-ray traces
AWSXRay.captureAWS(AWS);

export const consumer = async (event) => {
    const indexer = new Indexer('mainnet', 'eu-central-1');

    for (const record of event.Records) {
        const jsonBody = JSON.parse(record.body);
        const block_height = jsonBody.block_height;
        const functions = {};

        const function_config = jsonBody.indexer_function;
        const function_name = function_config.account_id + '/' + function_config.function_name;
        functions[function_name] = function_config;

        const mutations = await indexer.runFunctions(block_height, functions, {imperative: true, provision: true});
    }
};
