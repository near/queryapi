import { Block } from '@near-lake/primitives';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import LakeClient from './lake-client';
import type RedisClient from '../redis-client';

describe('LakeClient', () => {
  test('Indexer.fetchBlock() should fetch a block from S3', async () => {
    const author = 'dokiacapital.poolv1.near';
    const mockData = JSON.stringify({
      author
    });
    const mockSend = jest.fn().mockResolvedValue({
      Body: {
        transformToString: () => mockData
      }
    });
    const mockS3 = {
      send: mockSend,
    } as unknown as S3Client;

    const client = new LakeClient('mainnet', mockS3);

    const blockHeight = 84333960;
    const block = await client.fetchBlockPromise(blockHeight);
    const params = {
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/block.json`
    };

    expect(mockS3.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockSend.mock.calls[0][0])).toMatch(JSON.stringify(new GetObjectCommand(params)));
    expect(block.author).toEqual(author);
  });

  test('Indexer.fetchShard() should fetch a shard from S3', async () => {
    const mockData = JSON.stringify({});
    const mockSend = jest.fn().mockResolvedValue({
      Body: {
        transformToString: () => mockData
      }
    });
    const mockS3 = {
      send: mockSend,
    } as unknown as S3Client;
    const client = new LakeClient('mainnet', mockS3);

    const blockHeight = 82699904;
    const shard = 0;
    const params = {
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_${shard}.json`
    };
    await client.fetchShardPromise(blockHeight, shard);

    expect(JSON.stringify(mockSend.mock.calls[0][0])).toMatch(JSON.stringify(new GetObjectCommand(params)));
  });

  test('Indexer.fetchStreamerMessage() should fetch the block and shards from S3 upon cache miss', async () => {
    const blockHeight = 85233529;
    const blockHash = 'xyz';
    const mockSend = jest.fn()
      .mockReturnValueOnce({ // block
        Body: {
          transformToString: () => JSON.stringify({
            chunks: [0],
            header: {
              height: blockHeight,
              hash: blockHash,
            }
          })
        }
      })
      .mockReturnValue({ // shard
        Body: {
          transformToString: () => JSON.stringify({})
        }
      });
    const mockS3 = {
      send: mockSend,
    } as unknown as S3Client;
    const client = new LakeClient('mainnet', mockS3);

    const streamerMessage = await client.fetchStreamerMessage(blockHeight, true);

    expect(mockSend).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(mockSend.mock.calls[0][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/block.json`
    })));
    expect(JSON.stringify(mockSend.mock.calls[1][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_0.json`
    })));

    const block = Block.fromStreamerMessage(streamerMessage);

    expect(block.blockHeight).toEqual(blockHeight);
    expect(block.blockHash).toEqual(blockHash);
  });

  test('fetchStreamerMessage should fetch the message from cache and return it', async () => {
    const blockHeight = 85233529;
    const blockHash = 'xyz';
    const getMessage = jest.fn()
      .mockReturnValueOnce(JSON.stringify(
        {
          block: {
            chunks: [0],
            header: {
              height: blockHeight,
              hash: blockHash,
            }
          },
          shards: {}
        }
      ));
    const mockRedis = {
      getStreamerMessage: getMessage
    } as unknown as RedisClient;
    const mockS3 = {} as unknown as S3Client;
    const client = new LakeClient('mainnet', mockS3, mockRedis);

    const streamerMessage = await client.fetchStreamerMessage(blockHeight, false);

    expect(getMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(getMessage.mock.calls[0])).toEqual(
      `[${blockHeight}]`
    );
    const block = Block.fromStreamerMessage(streamerMessage);

    expect(block.blockHeight).toEqual(blockHeight);
    expect(block.blockHash).toEqual(blockHash);
  });

  test('fetchStreamerMessage should fetch the block and shards from S3 upon cache miss', async () => {
    const blockHeight = 85233529;
    const blockHash = 'xyz';
    const mockSend = jest.fn()
      .mockReturnValueOnce({ // block
        Body: {
          transformToString: () => JSON.stringify({
            chunks: [0],
            header: {
              height: blockHeight,
              hash: blockHash,
            }
          })
        }
      })
      .mockReturnValue({ // shard
        Body: {
          transformToString: () => JSON.stringify({})
        }
      });
    const mockS3 = {
      send: mockSend,
    } as unknown as S3Client;
    const transparentRedis = {
      getStreamerMessage: jest.fn()
    } as unknown as RedisClient;
    const client = new LakeClient('mainnet', mockS3, transparentRedis);

    const streamerMessage = await client.fetchStreamerMessage(blockHeight, false);

    expect(mockSend).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(mockSend.mock.calls[0][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/block.json`
    })));
    expect(JSON.stringify(mockSend.mock.calls[1][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_0.json`
    })));
    expect(transparentRedis.getStreamerMessage).toHaveBeenCalledTimes(1);

    const block = Block.fromStreamerMessage(streamerMessage);

    expect(block.blockHeight).toEqual(blockHeight);
    expect(block.blockHash).toEqual(blockHash);
  });

  test('fetchStreamerMessage should fetch the block and shards from S3 and not cache if historical', async () => {
    const blockHeight = 85233529;
    const blockHash = 'xyz';
    const mockSend = jest.fn()
      .mockReturnValueOnce({ // block
        Body: {
          transformToString: () => JSON.stringify({
            chunks: [0],
            header: {
              height: blockHeight,
              hash: blockHash,
            }
          })
        }
      })
      .mockReturnValue({ // shard
        Body: {
          transformToString: () => JSON.stringify({})
        }
      });
    const mockS3 = {
      send: mockSend,
    } as unknown as S3Client;
    const mockRedis = {
      getStreamerMessage: jest.fn()
    } as unknown as RedisClient;
    const client = new LakeClient('mainnet', mockS3, mockRedis);

    const streamerMessage = await client.fetchStreamerMessage(blockHeight, true);

    expect(mockSend).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(mockSend.mock.calls[0][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/block.json`
    })));
    expect(JSON.stringify(mockSend.mock.calls[1][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_0.json`
    })));
    expect(mockRedis.getStreamerMessage).toHaveBeenCalledTimes(0);

    const block = Block.fromStreamerMessage(streamerMessage);

    expect(block.blockHeight).toEqual(blockHeight);
    expect(block.blockHash).toEqual(blockHash);
  });
});
