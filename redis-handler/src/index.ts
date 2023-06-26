import { createClient } from "redis";

import Runner from "./runner";

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const runner = new Runner("mainnet");

// const BATCH_SIZE = 1;
const STREAM_START_ID = "0";
// const STREAM_THROTTLE_MS = 250;
const STREAM_HANDLER_THROTTLE_MS = 500;

client.on("error", (err) => console.log("Redis Client Error", err));

const runFunction = async (indexerName: string, blockHeight: string) => {
  const { account_id, function_name, code, schema } = await getIndexerData(
    indexerName
  );

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

type StreamMessages<Message> = {
  id: string;
  message: Message;
}[];

const getMessagesFromStream = async <Message extends { [x: string]: string }>(
  indexerName: string,
  lastId: string | null,
  count: number
): Promise<StreamMessages<Message> | null> => {
  const id = lastId ?? STREAM_START_ID;
  const streamName = `${indexerName}/stream`;

  const results = await client.xRead(
    { key: streamName, id },
    // can't use blocking calls as running single threaded
    { COUNT: count }
  );

  return results && (results[0].messages as StreamMessages<Message>);
};

const getLastProcessedId = async (
  indexerName: string
): Promise<string | null> => {
  return client.get(`${indexerName}/stream/lastId`);
};

const setLastProcessedId = async (
  indexerName: string,
  lastId: string
): Promise<void> => {
  await client.set(`${indexerName}/stream/lastId`, lastId);
};

type IndexerConfig = {
  account_id: string;
  function_name: string;
  code: string;
  schema: string;
};

const getIndexerData = async (indexerName: string): Promise<IndexerConfig> => {
  const results = await client.get(`${indexerName}/config`);

  if (!results) {
    throw new Error(`${indexerName} does not have any data`);
  }

  return JSON.parse(results);
};

type IndexerStreamMessage = {
  block_height: string;
};

const processStream = async (indexerName: string) => {
  while (true) {
    try {
      const lastProcessedId = await getLastProcessedId(indexerName);
      const messages = await getMessagesFromStream<IndexerStreamMessage>(
        indexerName,
        lastProcessedId,
        1
      );

      if (!messages) {
        continue;
      }

      const [{ id, message }] = messages;

      await runFunction(indexerName, message.block_height);

      await setLastProcessedId(indexerName, id);

      console.log(`Success: ${indexerName}`);
    } catch (err) {
      console.log(`Failed: ${indexerName}`, err);
    }
  }
};

type StreamHandlers = {
  [indexerName: string]: Promise<void>;
};

(async function main() {
  await client.connect();

  const streamHandlers: StreamHandlers = {};

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
})();
