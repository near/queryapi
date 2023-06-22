import { createClient } from "redis";

import Runner from "./runner";

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const runner = new Runner("mainnet");

// const BATCH_SIZE = 1;
const DEFAULT_ID = "0";
// const STREAM_THROTTLE_MS = 250;
const STREAM_HANDLER_THROTTLE_MS = 500;

client.on("error", (err) => console.log("Redis Client Error", err));

const runFunction = async (indexerName: string, blockHeight: string) => {
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

  await runner.runFunctions(Number(blockHeight), functions, {
    imperative: true,
    provision: true,
  });
};

const lastIdByIndexer: { [name: string]: string } = {};

// type IndexerStreamMessage = {
//   block_height: string;
// };

const getLatestBlockHeightFromStream = async (indexerName: string) => {
  const id = lastIdByIndexer[indexerName] ?? DEFAULT_ID;

  const results = await client.xRead(
    { key: `${indexerName}/stream`, id },
    { COUNT: 1, BLOCK: 0 }
  );

  if (!results) {
    throw new Error(`Unable to fetch latest block height from stream: ${indexerName}`);
  }

  const lastId = results[0].messages[0].id;
  lastIdByIndexer[indexerName] = lastId;

  const { block_height } = results[0].messages[0].message;

  return block_height;
};

const getIndexerData = async (indexerName: string) => {
  const results = await client.get(`${indexerName}/storage`);

  if (!results) {
    throw new Error(`${indexerName} does not have any data`);
  }

  return JSON.parse(results);
};

const processStream = async (indexerName: string) => {
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

(async function main() {
  await client.connect();

  const streamHandlers: { [name: string]: Promise<any> } = {};

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
})()

