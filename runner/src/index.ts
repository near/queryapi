import { createClient } from 'redis';

import Indexer from './indexer';

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer('mainnet');

// const BATCH_SIZE = 1;
const STREAM_START_ID = '0';
// const STREAM_THROTTLE_MS = 250;
const STREAM_HANDLER_THROTTLE_MS = 500;

client.on('error', (err) => { console.log('Redis Client Error', err); });

const runFunction = async (indexerName: string, blockHeight: string): Promise<void> => {
  const { account_id: accountId, function_name: functionName, code, schema } = await getIndexerData(
    indexerName,
  );

  const functions = {
    [indexerName]: {
      account_id: accountId,
      function_name: functionName,
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

type StreamMessages<Message> = Array<{
  id: string
  message: Message
}>;

const getMessagesFromStream = async <Message extends Record<string, string>>(
  streamName: string,
  lastId: string | null,
  count: number,
): Promise<StreamMessages<Message> | null> => {
  const id = lastId ?? STREAM_START_ID;

  const results = await client.xRead(
    { key: streamName, id },
    // can't use blocking calls as running single threaded
    { COUNT: count, BLOCK: 0 }
  );

  return results?.[0].messages as StreamMessages<Message>;
};

const getLastProcessedId = async (
  indexerName: string,
): Promise<string | null> => {
  return await client.get(`${indexerName}/stream/lastId`);
};

const setLastProcessedId = async (
  indexerName: string,
  lastId: string,
): Promise<void> => {
  await client.set(`${indexerName}/stream/lastId`, lastId);
};

interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
}

const getIndexerData = async (indexerName: string): Promise<IndexerConfig> => {
  const results = await client.get(`${indexerName}:storage`);

  if (results === null) {
    throw new Error(`${indexerName} does not have any data`);
  }

  return JSON.parse(results);
};

type IndexerStreamMessage = Record<string, string>;

const processStream = async (streamName: string): Promise<void> => {
  const indexerName = streamName.split(':')[0];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const lastProcessedId = await getLastProcessedId(indexerName);
      const messages = await getMessagesFromStream<IndexerStreamMessage>(
        streamName,
        lastProcessedId,
        1,
      );

      if (messages == null) {
        console.log(`No messages: ${indexerName}`);
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

type StreamHandlers = Record<string, Promise<void>>;

void (async function main () {
  try {
    await client.connect();

    const streamHandlers: StreamHandlers = {};

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const streams = await client.sMembers('streams');

      streams.forEach((streamName) => {
        if (streamHandlers[streamName] !== undefined) {
          return;
        }

        const handler = processStream(streamName);
        streamHandlers[streamName] = handler;
      });

      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await client.disconnect();
  }
})();
