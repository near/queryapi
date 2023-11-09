import RedisClient from './redis-client';

describe('RedisClient', () => {
  it('returns the first message', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      xRead: jest.fn().mockResolvedValue(null),
    } as any;

    const client = new RedisClient(mockClient);

    const message = await client.getNextStreamMessage('streamKey');

    expect(mockClient.xRead).toHaveBeenCalledWith(
      { key: 'streamKey', id: '0' },
      { COUNT: 1 }
    );
    expect(message).toBeUndefined();
  });

  it('deletes the stream message', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      xDel: jest.fn().mockResolvedValue(null),
    } as any;

    const client = new RedisClient(mockClient);

    await client.deleteStreamMessage('streamKey', '1-1');

    expect(mockClient.xDel).toHaveBeenCalledWith('streamKey', '1-1');
  });

  it('returns the range of messages after the passed id', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      xRange: jest.fn().mockResolvedValue([
        'data'
      ]),
    } as any;

    const client = new RedisClient(mockClient);

    const unprocessedMessages = await client.getUnprocessedStreamMessages('streamKey');

    expect(mockClient.xRange).toHaveBeenCalledWith('streamKey', '0', '+');
    expect(unprocessedMessages).toEqual([
      'data'
    ]);
  });

  it('returns stream storage data', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      get: jest.fn().mockResolvedValue(JSON.stringify({ account_id: '123', function_name: 'testFunc' })),
    } as any;

    const client = new RedisClient(mockClient);

    const storageData = await client.getStreamStorage('streamKey');

    expect(mockClient.get).toHaveBeenCalledWith('streamKey:storage');
    expect(storageData).toEqual({ account_id: '123', function_name: 'testFunc' });
  });

  it('returns the list of streams', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      sMembers: jest.fn().mockResolvedValue(['streamKey1', 'streamKey2']),
    } as any;

    const client = new RedisClient(mockClient);

    const streams = await client.getStreams();

    expect(mockClient.sMembers).toHaveBeenCalledWith('streams');
    expect(streams).toEqual(['streamKey1', 'streamKey2']);
  });

  it('returns streamer message', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      get: jest.fn(),
    } as any;

    const client = new RedisClient(mockClient);
    await client.getStreamerMessage(1000);

    expect(mockClient.get).toHaveBeenCalledWith('streamer:message:1000');
  });
});
