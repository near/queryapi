import { createClient } from 'redis';

import Indexer from "./indexer.js";

const client = createClient();
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

    console.log(JSON.stringify(message, null, 2));
}

await client.disconnect();
