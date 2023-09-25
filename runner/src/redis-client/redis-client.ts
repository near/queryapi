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

type StreamType = 'historical' | 'real-time';

export default class RedisClient {
  SMALLEST_STREAM_ID = '0';
  LARGEST_STREAM_ID = '+';
  STREAMS_SET_KEY = 'streams';
  STREAMER_BLOCK_HASH_KEY_BASE = 'streamer:block:cache:';
  STREAMER_SHARD_HASH_KEY_BASE = 'streamer:shard:cache:';

  constructor (
    private readonly client: RedisClientType = createClient({ url: process.env.REDIS_CONNECTION_STRING })
  ) {
    client.on('error', (err) => { console.log('Redis Client Error', err); });
    client.connect().catch(console.error);
  }

  private generateStorageKey (streamkey: string): string {
    return `${streamkey}:storage`;
  };

  getStreamType (streamKey: string): StreamType {
    if (streamKey.endsWith(':historical:stream')) {
      return 'historical';
    }
    return 'real-time';
  }

  async disconnect (): Promise<void> {
    await this.client.disconnect();
  }

  async getNextStreamMessage (
    streamKey: string,
  ): Promise<StreamMessage[] | null> {
    const results = await this.client.xRead(
      { key: streamKey, id: this.SMALLEST_STREAM_ID },
      { COUNT: 1 }
    );

    return results?.[0].messages as StreamMessage[];
  };

  async deleteStreamMessage (
    streamKey: string,
    id: string,
  ): Promise<void> {
    await this.client.xDel(streamKey, id);
  };

  async getUnprocessedStreamMessages (
    streamKey: string,
  ): Promise<StreamMessage[]> {
    const results = await this.client.xRange(streamKey, this.SMALLEST_STREAM_ID, this.LARGEST_STREAM_ID);

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

  async addStreamerBlockToCache (hashKey: string, key: string, blockData: string): Promise<void> {
    await this.client.setEx(`${this.STREAMER_BLOCK_HASH_KEY_BASE}${hashKey}:${key}`, 30, blockData);
  }

  async getStreamerBlockFromCache (hashKey: string, key: string): Promise<string | null> {
    return await this.client.get(`${this.STREAMER_BLOCK_HASH_KEY_BASE}${hashKey}:${key}`);
  }

  async addStreamerShardToCache (hashKey: string, key: string, blockData: string): Promise<void> {
    await this.client.setEx(`${this.STREAMER_BLOCK_HASH_KEY_BASE}${hashKey}:${key}`, 30, blockData);
  }

  async getStreamerShardFromCache (hashKey: string, key: string): Promise<string | null> {
    return await this.client.get(`${this.STREAMER_BLOCK_HASH_KEY_BASE}${hashKey}:${key}`);
  }
}
