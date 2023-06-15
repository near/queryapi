import { createClient } from "redis";

import Indexer from "./indexer.js";

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer("mainnet");

const BATCH_SIZE = 1;

client.on("error", (err) => console.log("Redis Client Error", err));

await client.connect();

// should probably store this in redis
const lastIdByAccount = {};

while (true) {
    const indexer_names = await client.sMembers("indexers");

    await Promise.all(
        indexer_names.map(async (indexer_name) => {
            const id = lastIdByAccount[indexer_name] ?? "0";

            const results = await client.xRead(
                { key: indexer_name, id },
                { COUNT: 1 }
            );

            if (!results) {
                return;
            }

            const lastId = results[0].messages[0].id;
            const { message } = results[0].messages[0];

            lastIdByAccount[indexer_name] = lastId;

            const functions = {};
            const function_name = message.account_id + "/" + message.function_name;
            functions[function_name] = {
                account_id: message.account_id,
                function_name: message.function_name,
                code: message.code,
                schema: message.schema,
                provisioned: false,
            };

            try {
                await indexer.runFunctions(
                    Number(message.block_height),
                    functions,
                    false,
                    { imperative: true, provision: true }
                );
                console.log(`Success: ${indexer_name}`);
            } catch (err) {
                console.log(`Failed: ${indexer_name}`, err);
            }
        })
    );
}

await client.disconnect();
