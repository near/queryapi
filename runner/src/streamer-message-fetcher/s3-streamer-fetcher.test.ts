import { Block } from '@near-lake/primitives';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import S3StreamerMessageFetcher from './s3-streamer-fetcher';

describe('S3StreamerMessageFetcher', () => {
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

    const fetcher = new S3StreamerMessageFetcher('mainnet', mockS3);

    const blockHeight = 84333960;
    const block = await fetcher.fetchBlockPromise(blockHeight);
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
    const fetcher = new S3StreamerMessageFetcher('mainnet', mockS3);

    const blockHeight = 82699904;
    const shard = 0;
    const params = {
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_${shard}.json`
    };
    await fetcher.fetchShardPromise(blockHeight, shard);

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
    const fetcher = new S3StreamerMessageFetcher('mainnet', mockS3);

    const streamerMessage = await fetcher.buildStreamerMessage(blockHeight);

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
});
