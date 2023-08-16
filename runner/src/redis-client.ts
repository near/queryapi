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

  constructor (
    private readonly client: RedisClientType = createClient({ url: process.env.REDIS_CONNECTION_STRING })
  ) {
    client.on('error', (err) => { console.log('Redis Client Error', err); });
    client.connect().catch(console.error);
  }

  private generateStreamKey (name: string): string {
    return `${name}:stream`;
  };

  private generateStorageKey (name: string): string {
    return `${name}:storage`;
  };

  private generateStreamLastIdKey (name: string): string {
    return `${name}:stream:lastId`;
  };

  private incrementStreamId (id: string): string {
    const [timestamp, sequenceNumber] = id.split('-');
    const nextSequenceNumber = Number(sequenceNumber) + 1;
    return `${timestamp}-${nextSequenceNumber}`;
  };

  private async getLastProcessedStreamId (
    indexerName: string,
  ): Promise<string | null> {
    return await this.client.get(this.generateStreamLastIdKey(indexerName));
  };

  async disconnect (): Promise<void> {
    await this.client.disconnect();
  }

  async getNextStreamMessage (
    indexerName: string,
  ): Promise<StreamMessages<IndexerStreamMessage> | null> {
    const id = await this.getLastProcessedStreamId(indexerName) ?? this.STREAM_SMALLEST_ID;

    const results = await this.client.xRead(
      { key: this.generateStreamKey(indexerName), id },
      { COUNT: 1 }
    );

    return results?.[0].messages as StreamMessages<IndexerStreamMessage>;
  };

  async acknowledgeStreamMessage (
    indexerName: string,
    lastId: string,
  ): Promise<void> {
    await this.client.set(this.generateStreamLastIdKey(indexerName), lastId);
  };

  async getUnprocessedStreamMessages (
    indexerName: string,
  ): Promise<Array<StreamMessage<IndexerStreamMessage>>> {
    const lastProcessedId = await this.getLastProcessedStreamId(indexerName);
    const nextId = lastProcessedId ? this.incrementStreamId(lastProcessedId) : this.STREAM_SMALLEST_ID;

    const results = await this.client.xRange(this.generateStreamKey(indexerName), nextId, '+');

    return results as Array<StreamMessage<IndexerStreamMessage>>;
  };

  async getIndexerData (indexerName: string): Promise<IndexerConfig> {
    const results = await this.client.get(this.generateStorageKey(indexerName));

    if (results === null) {
      throw new Error(`${indexerName} does not have any data`);
    }

    return JSON.parse(results);
  };

  async getIndexers (): Promise<string[]> {
    return await this.client.sMembers(this.INDEXER_SET_KEY);
  }
}
