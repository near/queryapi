import Indexer from "./indexer.js";

export const consumer = async (event) => {
    const indexer = new Indexer('mainnet', 'us-west-2');
    const functions = await indexer.fetchIndexerFunctions();

    for (const record of event.Records) {
        try {
            const jsonBody = JSON.parse(record.body);
            // console.log("Received message: ", jsonBody);
            const block_height = jsonBody.alert_message.block_height;
            const block = await indexer.fetchBlock(block_height);
            // console.log('Fetched block: ', block);
            const mutations = await indexer.runFunctions(block, functions);
            console.log('Final Mutations: ', mutations);
            return {statusCode: 200, body: {"# of mutations applied": Object.keys(mutations).length}};
        } catch (error) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: error,
                }),
            };

        }
    }
};