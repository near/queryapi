import { createClient, type RedisClientType } from 'redis';

interface StreamMessage<Message> {
  id: string
  message: Message
}

type StreamMessages<Message> = Array<StreamMessage<Message>>;

type IndexerStreamMessage = {
  block_height: string
} & Record<string, string>;

interface IndexerConfig {
  account_id: string
  function_name: string
  code: string
  schema: string
}

export default class RedisClient {
  STREAM_SMALLEST_ID = '0';
  INDEXER_SET_KEY = 'indexers';

  constructor (private readonly client: RedisClientType = createClient({ url: process.env.REDIS_CONNECTION_STRING })) {
    client.on('error', (err) => { console.log('Redis Client Error', err); });
    client.connect().catch(console.error);
  }

  async disconnect (): Promise<void> {
    await this.client.disconnect();
  }

  generateStreamKey = (name: string): string => {
    return `${name}:stream`;
  };

  generateStorageKey = (name: string): string => {
    return `${name}:storage`;
  };

  generateStreamLastIdKey = (name: string): string => {
    return `${name}:stream:lastId`;
  };

  incrementStreamId = (id: string): string => {
    const [timestamp, sequenceNumber] = id.split('-');
    const nextSequenceNumber = Number(sequenceNumber) + 1;
    return `${timestamp}-${nextSequenceNumber}`;
  };

  getMessagesFromStream = async (
    indexerName: string,
    lastId: string | null,
    count: number,
  ): Promise<StreamMessages<IndexerStreamMessage> | null> => {
    const id = lastId ?? this.STREAM_SMALLEST_ID;

    const results = await this.client.xRead(
      { key: this.generateStreamKey(indexerName), id },
      // can't use blocking calls as running single threaded
      { COUNT: count }
    );

    return results?.[0].messages as StreamMessages<IndexerStreamMessage>;
  };

  getLastProcessedId = async (
    indexerName: string,
  ): Promise<string | null> => {
    return await this.client.get(this.generateStreamLastIdKey(indexerName));
  };

  setLastProcessedId = async (
    indexerName: string,
    lastId: string,
  ): Promise<void> => {
    await this.client.set(this.generateStreamLastIdKey(indexerName), lastId);
  };

  getUnprocessedMessages = async (
    indexerName: string,
    startId: string | null
  ): Promise<Array<StreamMessage<IndexerStreamMessage>>> => {
    const nextId = startId ? this.incrementStreamId(startId) : this.STREAM_SMALLEST_ID;

    const results = await this.client.xRange(this.generateStreamKey(indexerName), nextId, '+');

    return results as Array<StreamMessage<IndexerStreamMessage>>;
  };

  getIndexerData = async (indexerName: string): Promise<IndexerConfig> => {
    const results = await this.client.get(this.generateStorageKey(indexerName));

    if (results === null) {
      throw new Error(`${indexerName} does not have any data`);
    }

    return JSON.parse(results);
  };

  async getIndexers (): Promise<string[]> {
    return await this.client.sMembers();
  }
}
