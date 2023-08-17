import { createClient, type RedisClientType } from 'redis';

interface StreamMessage {
  id: string
  message: {
    block_height: string
  }
}

interface StreamStorage {
  account_id: string
  function_name: string
  code: string
  schema: string
}

export default class RedisClient {
  SMALLEST_STREAM_ID = '0';
  LARGEST_STREAM_ID = '+';
  STREAMS_SET_KEY = 'streams';

  constructor (
    private readonly client: RedisClientType = createClient({ url: process.env.REDIS_CONNECTION_STRING })
  ) {
    client.on('error', (err) => { console.log('Redis Client Error', err); });
    client.connect().catch(console.error);
  }

  private generateStorageKey (streamkey: string): string {
    return `${streamkey}:storage`;
  };

  private generateStreamLastIdKey (streamkey: string): string {
    return `${streamkey}:lastId`;
  };

  private incrementStreamId (id: string): string {
    const [timestamp, sequenceNumber] = id.split('-');
    const nextSequenceNumber = Number(sequenceNumber) + 1;
    return `${timestamp}-${nextSequenceNumber}`;
  };

  private async getLastProcessedStreamId (
    streamKey: string,
  ): Promise<string | null> {
    return await this.client.get(this.generateStreamLastIdKey(streamKey));
  };

  async disconnect (): Promise<void> {
    await this.client.disconnect();
  }

  async getNextStreamMessage (
    streamKey: string,
  ): Promise<StreamMessage[] | null> {
    const id = await this.getLastProcessedStreamId(streamKey) ?? this.SMALLEST_STREAM_ID;

    const results = await this.client.xRead(
      { key: streamKey, id },
      { COUNT: 1 }
    );

    return results?.[0].messages as StreamMessage[];
  };

  async acknowledgeStreamMessage (
    streamKey: string,
    id: string,
  ): Promise<void> {
    await this.client.set(this.generateStreamLastIdKey(streamKey), id);
  };

  async getUnprocessedStreamMessages (
    streamKey: string,
  ): Promise<StreamMessage[]> {
    const lastProcessedId = await this.getLastProcessedStreamId(streamKey);
    const nextId = lastProcessedId ? this.incrementStreamId(lastProcessedId) : this.SMALLEST_STREAM_ID;

    const results = await this.client.xRange(streamKey, nextId, this.LARGEST_STREAM_ID);

    return results as StreamMessage[];
  };

  async getStreamStorage (streamKey: string): Promise<StreamStorage> {
    const storageKey = this.generateStorageKey(streamKey);
    const results = await this.client.get(storageKey);

    if (results === null) {
      throw new Error(`${storageKey} does not have any data`);
    }

    return JSON.parse(results);
  };

  async getStreams (): Promise<string[]> {
    return await this.client.sMembers(this.STREAMS_SET_KEY);
  }
}
