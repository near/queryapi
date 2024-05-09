import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Block } from '@near-lake/primitives';
import { VError } from 'verror';

import { METRICS } from '../metrics';
import RedisClient from '../redis-client';

class GetObjectError extends VError {}

export default class LakeClient {
  constructor (
    private readonly network: string = 'mainnet',
    private readonly s3Client: S3Client = new S3Client({
      maxAttempts: 5,
      retryMode: 'adaptive'
    }),
    private readonly redisClient: RedisClient = new RedisClient()
  ) {}

  // pad with 0s to 12 digits
  private normalizeBlockHeight (blockHeight: number): string {
    return blockHeight.toString().padStart(12, '0');
  }

  private async getObject (bucket: string, key: string): Promise<GetObjectCommandOutput> {
    try {
      return await this.s3Client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
    } catch (error) {
      throw new GetObjectError({ cause: error as Error, info: { bucket, key } }, 'Failed to fetch object from S3');
    }
  }

  private fetchShards (blockHeight: number, numberOfShards: number): Array<Promise<any>> {
    return ([...Array(numberOfShards).keys()].map(async (shardId) =>
      await this.fetchShard(blockHeight, shardId)
    ));
  }

  private async fetchShard (blockHeight: number, shardId: number): Promise<any> {
    const response = await this.getObject(
      `near-lake-data-${this.network}`,
      `${this.normalizeBlockHeight(blockHeight)}/shard_${shardId}.json`,
    );
    const shardData = await response.Body?.transformToString() ?? '{}';
    return JSON.parse(shardData, (_key, value) => this.renameUnderscoreFieldsToCamelCase(value));
  }

  private async fetchBlockPromise (blockHeight: number): Promise<any> {
    const response = await this.getObject(
      `near-lake-data-${this.network}`,
      `${this.normalizeBlockHeight(blockHeight)}/block.json`
    );
    const blockData = await response.Body?.transformToString() ?? '{}';
    return JSON.parse(blockData, (_key, value) => this.renameUnderscoreFieldsToCamelCase(value));
  }

  private renameUnderscoreFieldsToCamelCase (value: Record<string, any>): Record<string, any> {
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

  async fetchBlock (blockHeight: number): Promise<Block> {
    const cachedMessage = await this.redisClient.getStreamerMessage(blockHeight);
    if (cachedMessage) {
      METRICS.CACHE_HIT.inc();
      const parsedMessage = JSON.parse(cachedMessage);
      return Block.fromStreamerMessage(parsedMessage);
    } else {
      METRICS.CACHE_MISS.inc();
    }

    const block = await this.fetchBlockPromise(blockHeight);
    const shards = await Promise.all(this.fetchShards(blockHeight, block.chunks.length));

    return Block.fromStreamerMessage({
      block,
      shards,
    });
  }
}
