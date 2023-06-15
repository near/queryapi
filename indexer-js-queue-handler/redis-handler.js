import { createClient } from 'redis';

import Indexer from "./indexer.js";

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer('mainnet')

const BATCH_SIZE = 10

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

let lastId = '0';

while (true) {
    const results = await client.xRead(
        { key: 'functions', id: lastId },
        { /* BLOCK: 0, */ COUNT: BATCH_SIZE }
    );

    if (!results) {
        break;
    }

    const { messages } = results[0];

    lastId = messages[messages.length - 1].id;

    await Promise.all(messages.map(async ({ message }) => {
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
            console.log(`Success: ${message.account_id}/${message.function_name}`)
        } catch(err) {
            console.log(`Failed: ${message.account_id}/${message.function_name}`, err)
        }
    }));
}

await client.disconnect();
