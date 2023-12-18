import type StreamHandler from '../stream-handler/stream-handler';
import getRunnerService from './runner-service';

describe('Runner gRPC Service', () => {
  let genericStreamHandlerType: typeof StreamHandler;
  beforeEach(() => {
    genericStreamHandlerType = jest.fn().mockImplementation(() => {
      return { updateIndexerConfig: jest.fn() };
    });
  });

  it('starts a stream with correct settings', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const redisStream = 'test-redis-stream';
    const indexerConfig = {
      account_id: 'test-account-id',
      function_name: 'test-function-name',
      code: 'test-code',
      schema: 'test-schema',
    };
    const request = {
      request: {
        streamId: 'test-stream-id',
        redisStream,
        indexerConfig: JSON.stringify(indexerConfig),
      }
    } as unknown as any;
    service.StartStream(request, mockCallback);
    expect(genericStreamHandlerType).toHaveBeenCalledWith(redisStream, indexerConfig);
    expect(mockCallback).toHaveBeenCalledWith(null, { streamId: 'test-stream-id' });
  });
});
