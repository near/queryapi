import { createClient } from "redis";

import Indexer from "./indexer.js";

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer("mainnet");

const BATCH_SIZE = 1;
const DEFAULT_ID = "0";
const STREAM_THROTTLE_MS = 250;
const STREAM_HANDLER_THROTTLE_MS = 500;

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

    await indexer.runFunctions(Number(message.block_height), functions, false, {
        imperative: true,
        provision: true,
    });
};

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

    return message;
};

const processStream = async (indexerName) => {
    while (true) {
        try {
            const message = await getLatestMessageFromStream(indexerName);
            if (message) {
                await runFunction(message);
                console.log(`Success: ${indexerName}`);
            } else {
                console.log(`Waiting: ${indexerName}`)
                await new Promise((resolve) => setTimeout(resolve, STREAM_THROTTLE_MS));
            }
        } catch (err) {
            console.log(`Failed: ${indexerName}`, err);
        }
    }
};

const streamHandlers = {};

while (true) {
    const indexers = await client.sMembers("indexers");

    indexers.forEach((indexerName) => {
        if (!!streamHandlers[indexerName]) {
            return;
        }

        const handler = processStream(indexerName);
        streamHandlers[indexerName] = handler;
    });

    await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS)
    );
}

await client.disconnect();
