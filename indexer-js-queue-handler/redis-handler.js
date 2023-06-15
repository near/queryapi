import { createClient } from "redis";

import Indexer from "./indexer.js";

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer("mainnet");

const BATCH_SIZE = 1;
const DEFAULT_ID = "0";

client.on("error", (err) => console.log("Redis Client Error", err));

await client.connect();

const runFunction = async (message) => {
    const functions = {};
    const functionName = message.account_id + "/" + message.function_name;
    functions[functionName] = {
        account_id: message.account_id,
        function_name: message.function_name,
        code: message.code,
        schema: message.schema,
        provisioned: false,
    };

    try {
        await indexer.runFunctions(Number(message.block_height), functions, false, {
            imperative: true,
            provision: true,
        });
        console.log(`Success: ${functionName}`);
    } catch (err) {
        console.log(`Failed: ${functionName}`, err);
    }
};

// should probably store this in redis
const lastIdByIndexer = {};

const getLatestMessageFromStream = async (indexerName) => {
    const id = lastIdByIndexer[indexerName] ?? DEFAULT_ID;

    const results = await client.xRead({ key: indexerName, id }, { COUNT: 1 });

    if (!results) {
        return null;
    }

    const lastId = results[0].messages[0].id;
    lastIdByIndexer[indexerName] = lastId;

    const { message } = results[0].messages[0];

    return message
};

while (true) {
    const indexers = await client.sMembers("indexers");

    await Promise.all(
        indexers.map(async (indexer_name) => {
            const message = await getLatestMessageFromStream(indexer_name);
            if (message) {
                await runFunction(message);
            }
        })
    );
}

await client.disconnect();
