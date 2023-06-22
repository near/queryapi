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

const runFunction = async (indexerName, blockHeight) => {
  const { account_id, function_name, code, schema } = await getIndexerData(indexerName);

  const functions = {
    [indexerName]: {
      account_id,
      function_name,
      code,
      schema,
      provisioned: false,
    },
  };

  await indexer.runFunctions(Number(blockHeight), functions, false, {
    imperative: true,
    provision: true,
  });
};

const lastIdByIndexer = {};

const getLatestBlockHeightFromStream = async (indexerName) => {
  const id = lastIdByIndexer[indexerName] ?? DEFAULT_ID;

  const results = await client.xRead(
    { key: `${indexerName}/stream`, id },
    { COUNT: 1, BLOCK: 0 }
  );

  const lastId = results[0].messages[0].id;
  lastIdByIndexer[indexerName] = lastId;

  const { block_height } = results[0].messages[0].message;

  return block_height;
};

const getIndexerData = async (indexerName) => {
  const results = await client.get(`${indexerName}/storage`);

  if (!results) {
    throw new Error(`${indexerName} does not have any data`);
  }

  return JSON.parse(results);
};

const processStream = async (indexerName) => {
  while (true) {
    try {
      const blockHeight = await getLatestBlockHeightFromStream(indexerName);

      await runFunction(indexerName, blockHeight);

      console.log(`Success: ${indexerName}`);
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
