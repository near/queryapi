import { createClient } from 'redis';

import Indexer from "./indexer.js";

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer('mainnet')

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

let lastId = '$';

while (true) {
    const results = await client.xRead(
        { key: 'functions', id: lastId },
        { BLOCK: 0, COUNT: 1 }
    );

    lastId = results[0].messages[0].id;

    const message = results[0].messages[0].message;

    const functions = {};

    const function_name = message.account_id + '/' + message.function_name;
    functions[function_name] = {
        account_id: message.account_id,
        function_name: message.function_name,
        code: message.code,
        schema: message.schema,
        provisioned: false,
    };

    try {
        await indexer.runFunctions(Number(message.block_height), functions, false, {imperative: true, provision: true});
    } catch {}
}

await client.disconnect();
