import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import LakeClient from './lake-client';

describe('LakeClient', () => {
  test('Indexer.fetchBlock() should fetch the block and shards from S3 upon cache miss', async () => {
    const blockHeight = 85233529;
    const blockHash = 'xyz';
    const mockSend = jest.fn()
      .mockReturnValueOnce({ // block
        Body: {
          transformToString: () => JSON.stringify({
            chunks: [0, 1, 2, 3],
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

    const block = await client.fetchBlock(blockHeight);

    expect(mockSend).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(mockSend.mock.calls[0][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/block.json`
    })));
    expect(JSON.stringify(mockSend.mock.calls[1][0])).toStrictEqual(JSON.stringify(new GetObjectCommand({
      Bucket: 'near-lake-data-mainnet',
      Key: `${blockHeight.toString().padStart(12, '0')}/shard_0.json`
    })));

    expect(block.blockHeight).toEqual(blockHeight);
    expect(block.blockHash).toEqual(blockHash);
  });
});
