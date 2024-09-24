import RedisClient from './redis-client';

describe('RedisClient', () => {
  it('returns the first message', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      xRead: jest.fn().mockResolvedValue(null),
    } as any;

    const client = new RedisClient(mockClient);

    const message = await client.getStreamMessages('streamKey');

    expect(mockClient.xRead).toHaveBeenCalledWith(
      { key: 'streamKey', id: '0' },
      { COUNT: 1 }
    );
    expect(message).toBeUndefined();
  });

  it('returns count of messages after id with block', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      xRead: jest.fn().mockResolvedValue(null),
    } as any;

    const client = new RedisClient(mockClient);

    const message = await client.getStreamMessages('streamKey', '123-0', 10);

    expect(mockClient.xRead).toHaveBeenCalledWith(
      { key: 'streamKey', id: '123-0' },
      { COUNT: 10 }
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

  it('returns the number of messages in stream', async () => {
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(null),
      xLen: jest.fn().mockResolvedValue(2),
    } as any;

    const client = new RedisClient(mockClient);

    const unprocessedMessageCount = await client.getUnprocessedStreamMessageCount('streamKey');

    expect(mockClient.xLen).toHaveBeenCalledWith('streamKey');
    expect(unprocessedMessageCount).toEqual(2);
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

    expect(mockClient.get).toHaveBeenCalledWith('streamer_message:1000');
  });
});
