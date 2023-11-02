import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { type StreamerMessage } from '@near-lake/primitives';
import { METRICS } from '../metrics';
import RedisClient from '../redis-client/redis-client';

export default class LakeClient {
  network: string;
  private readonly s3Client: S3Client;
  private readonly redisClient: RedisClient;
  constructor (
    network: string = 'mainnet',
    s3Client: S3Client = new S3Client(),
    redisClient: RedisClient = new RedisClient()
  ) {
    this.network = network;
    this.s3Client = s3Client;
    this.redisClient = redisClient;
  }

  // pad with 0s to 12 digits
  normalizeBlockHeight (blockHeight: number): string {
    return blockHeight.toString().padStart(12, '0');
  }

  async fetchShardsPromises (blockHeight: number, numberOfShards: number): Promise<Array<Promise<any>>> {
    return ([...Array(numberOfShards).keys()].map(async (shardId) =>
      await this.fetchShardPromise(blockHeight, shardId)
    ));
  }

  async fetchShardPromise (blockHeight: number, shardId: number): Promise<any> {
    const params = {
      Bucket: `near-lake-data-${this.network}`,
      Key: `${this.normalizeBlockHeight(blockHeight)}/shard_${shardId}.json`,
    };
    const response = await this.s3Client.send(new GetObjectCommand(params));
    const shardData = await response.Body?.transformToString() ?? '{}';
    return JSON.parse(shardData, (_key, value) => this.renameUnderscoreFieldsToCamelCase(value));
  }

  async fetchBlockPromise (blockHeight: number): Promise<any> {
    const file = 'block.json';
    const folder = this.normalizeBlockHeight(blockHeight);
    const params = {
      Bucket: 'near-lake-data-' + this.network,
      Key: `${folder}/${file}`,
    };
    const response = await this.s3Client.send(new GetObjectCommand(params));
    const blockData = await response.Body?.transformToString() ?? '{}';
    return JSON.parse(blockData, (_key, value) => this.renameUnderscoreFieldsToCamelCase(value));
  }

  renameUnderscoreFieldsToCamelCase (value: Record<string, any>): Record<string, any> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // It's a non-null, non-array object, create a replacement with the keys initially-capped
      const newValue: any = {};
      for (const key in value) {
        const newKey: string = key
          .split('_')
          .map((word, i) => {
            if (i > 0) {
              return word.charAt(0).toUpperCase() + word.slice(1);
            }
            return word;
          })
          .join('');
        newValue[newKey] = value[key];
      }
      return newValue;
    }
    return value;
  }

  async fetchStreamerMessage (blockHeight: number, isHistorical: boolean): Promise<StreamerMessage> {
    if (!isHistorical) {
      const cachedMessage = await this.redisClient.getStreamerMessage(blockHeight);
      if (cachedMessage) {
        METRICS.CACHE_HIT.labels().inc();
        const parsedMessage = JSON.parse(cachedMessage);
        return parsedMessage;
      } else {
        METRICS.CACHE_MISS.labels().inc();
      }
    }

    const blockPromise = this.fetchBlockPromise(blockHeight);
    const shardsPromises = await this.fetchShardsPromises(blockHeight, 4);

    const results = await Promise.all([blockPromise, ...shardsPromises]);
    const block = results.shift();
    const shards = results;
    return {
      block,
      shards,
    };
  }
}
