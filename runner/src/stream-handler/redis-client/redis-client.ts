import { createClient, type RedisClientType } from 'redis';

import logger from '../../logger';

interface StreamMessage {
  id: string
  message: {
    block_height: string
  }
}

export default class RedisClient {
  SMALLEST_STREAM_ID = '0';
  LARGEST_STREAM_ID = '+';
  STREAMS_SET_KEY = 'streams';
  STREAMER_MESSAGE_HASH_KEY_BASE = 'streamer_message:';

  private readonly logger: typeof logger;

  constructor (
    private readonly client: RedisClientType = createClient({ url: process.env.REDIS_CONNECTION_STRING })
  ) {
    this.logger = logger.child({ service: this.constructor.name });

    client.on('error', (err) => { this.logger.error('Redis Client Error', err); });
    client.connect().catch(this.logger.error.bind(this));
  }

  async disconnect (): Promise<void> {
    await this.client.disconnect();
  }

  async getStreamMessages (
    streamKey: string,
    streamId = this.SMALLEST_STREAM_ID,
    count = 1
  ): Promise<StreamMessage[] | null> {
    const results = await this.client.xRead(
      { key: streamKey, id: streamId },
      { COUNT: count }
    );

    return results?.[0].messages as StreamMessage[];
  };

  async deleteStreamMessage (
    streamKey: string,
    id: string,
  ): Promise<void> {
    await this.client.xDel(streamKey, id);
  };

  async getUnprocessedStreamMessageCount (
    streamKey: string,
  ): Promise<number> {
    const results = await this.client.xLen(streamKey);

    return results;
  };

  async getStreams (): Promise<string[]> {
    return await this.client.sMembers(this.STREAMS_SET_KEY);
  }

  async getStreamerMessage (blockHeight: number): Promise<string | null> {
    return await this.client.get(`${this.STREAMER_MESSAGE_HASH_KEY_BASE}${blockHeight}`);
  }
}
