import { createClient } from 'redis';

import Indexer from './indexer';
import * as metrics from './metrics';

const client = createClient({ url: process.env.REDIS_CONNECTION_STRING });
const indexer = new Indexer('mainnet');

metrics.startServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});

// const BATCH_SIZE = 1;
const STREAM_SMALLEST_ID = '0';
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

interface StreamMessage<Message> {
  id: string
  message: Message
}

type StreamMessages<Message> = Array<StreamMessage<Message>>;

const getMessagesFromStream = async <Message extends Record<string, string>>(
  indexerName: string,
  lastId: string | null,
  count: number,
): Promise<StreamMessages<Message> | null> => {
  const id = lastId ?? STREAM_SMALLEST_ID;

  const results = await client.xRead(
    { key: generateStreamKey(indexerName), id },
    // can't use blocking calls as running single threaded
    { COUNT: count }
  );

  return results?.[0].messages as StreamMessages<Message>;
};

const incrementStreamId = (id: string): string => {
  const [timestamp, sequenceNumber] = id.split('-');
  const nextSequenceNumber = Number(sequenceNumber) + 1;
  return `${timestamp}-${nextSequenceNumber}`;
};

const getUnprocessedMessages = async <Message extends Record<string, string>>(
  indexerName: string,
  startId: string | null
): Promise<Array<StreamMessage<Message>>> => {
  const nextId = startId ? incrementStreamId(startId) : STREAM_SMALLEST_ID;

  const results = await client.xRange(generateStreamKey(indexerName), nextId, '+');

  return results as Array<StreamMessage<Message>>;
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

type IndexerStreamMessage = {
  block_height: string
} & Record<string, string>;

const processStream = async (indexerName: string): Promise<void> => {
  while (true) {
    try {
      const startTime = performance.now();

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

      const endTime = performance.now();

      metrics.EXECUTION_DURATION.labels({ indexer: indexerName }).set(endTime - startTime);

      const unprocessedMessages = await getUnprocessedMessages<IndexerStreamMessage>(indexerName, lastProcessedId);
      metrics.UNPROCESSED_STREAM_MESSAGES.labels({ indexer: indexerName }).set(unprocessedMessages?.length ?? 0);

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
