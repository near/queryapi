import { createClient } from 'redis';

import Indexer from './indexer';

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer('mainnet');

// const BATCH_SIZE = 1;
const STREAM_START_ID = '0';
// const STREAM_THROTTLE_MS = 250;
const STREAM_HANDLER_THROTTLE_MS = 500;

const INDEXER_SET_KEY = 'indexers';

client.on('error', (err) => { console.log('Redis Client Error', err); });

const generateStreamKey = (name: string): string => {
  return `${name}:stream`;
};

const generateStorageKey = (name: string): string => {
  return `${name}:storage`;
};

const generateStreamLastIdKey = (name: string): string => {
  return `${name}:stream:lastId`;
};

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
    provision: true,
  });
};

type StreamMessages<Message> = Array<{
  id: string
  message: Message
}>;

const getMessagesFromStream = async <Message extends Record<string, string>>(
  indexerName: string,
  lastId: string | null,
  count: number,
): Promise<StreamMessages<Message> | null> => {
  const id = lastId ?? STREAM_START_ID;

  const results = await client.xRead(
    { key: generateStreamKey(indexerName), id },
    // can't use blocking calls as running single threaded
    { COUNT: count }
  );

  return results?.[0].messages as StreamMessages<Message>;
};

const getLastProcessedId = async (
  indexerName: string,
): Promise<string | null> => {
  return await client.get(generateStreamLastIdKey(indexerName));
};

const setLastProcessedId = async (
  indexerName: string,
  lastId: string,
): Promise<void> => {
  await client.set(generateStreamLastIdKey(indexerName), lastId);
};

interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
}

const getIndexerData = async (indexerName: string): Promise<IndexerConfig> => {
  const results = await client.get(generateStorageKey(indexerName));

  if (results === null) {
    throw new Error(`${indexerName} does not have any data`);
  }

  return JSON.parse(results);
};

type IndexerStreamMessage = Record<string, string>;

const processStream = async (indexerName: string): Promise<void> => {
  while (true) {
    try {
      const lastProcessedId = await getLastProcessedId(indexerName);
      const messages = await getMessagesFromStream<IndexerStreamMessage>(
        indexerName,
        lastProcessedId,
        1,
      );

      if (messages == null) {
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

    while (true) {
      const indexers = await client.sMembers(INDEXER_SET_KEY);

      indexers.forEach((indexerName) => {
        if (streamHandlers[indexerName] !== undefined) {
          return;
        }

        const handler = processStream(indexerName);
        streamHandlers[indexerName] = handler;
      });

      await new Promise((resolve) =>
        setTimeout(resolve, STREAM_HANDLER_THROTTLE_MS),
      );
    }
  } finally {
    await client.disconnect();
  }
})();
