import type StreamHandler from '../stream-handler/stream-handler';
import getRunnerService from './runner-service';
import * as grpc from '@grpc/grpc-js';

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
    const startRequest = {
      request: {
        streamId: 'test-stream-id',
        redisStream,
        indexerConfig: JSON.stringify(indexerConfig),
      }
    } as unknown as any;

    service.StartStream(startRequest, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledWith(redisStream, indexerConfig);
    expect(mockCallback).toHaveBeenCalledWith(null, { streamId: 'test-stream-id' });
  });

  it('Invalid start stream request with empty stream Id', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const indexerConfig = {
      account_id: 'test-account-id',
      function_name: 'test-function-name',
      code: 'test-code',
      schema: 'test-schema',
    };
    const request = {
      request: {
        streamId: '',
        redisStream: 'test-redis-stream',
        indexerConfig: JSON.stringify(indexerConfig),
      }
    } as unknown as any;

    service.StartStream(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid streamId. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start stream request with missing redis stream Id parameter', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const indexerConfig = {
      account_id: 'test-account-id',
      function_name: 'test-function-name',
      code: 'test-code',
      schema: 'test-schema',
    };
    const request = {
      request: {
        streamId: 'test-stream-id',
        indexerConfig: JSON.stringify(indexerConfig),
      }
    } as unknown as any;

    service.StartStream(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid redisStream. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start stream request with missing indexer config parameter', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = {
      request: {
        streamId: 'test-stream-id',
        redisStream: 'test-redis-stream',
      }
    } as unknown as any;

    service.StartStream(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexerConfig. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start stream request with missing code parameter in indexerConfig', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const indexerConfig = {
      account_id: 'test-account-id',
      function_name: 'test-function-name',
      schema: 'test-schema',
    };
    const request = {
      request: {
        streamId: 'test-stream-id',
        redisStream: 'test-redis-stream',
        indexerConfig: JSON.stringify(indexerConfig),
      }
    } as unknown as any;

    service.StartStream(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexer config. It must contain account id, function name, code, and schema.'
    }, null);
  });

  it('Invalid start stream request with invalid JSON for indexerConfig', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = {
      request: {
        streamId: 'test-stream-id',
        redisStream: 'test-redis-stream',
        indexerConfig: '{',
      }
    } as unknown as any;

    service.StartStream(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexer config. It must be a valid JSON string.'
    }, null);
  });

  it('starts a stream twice with correct settings, gets error second time', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const redisStream = 'test-redis-stream';
    const indexerConfig = {
      account_id: 'test-account-id',
      function_name: 'test-function-name',
      code: 'test-code',
      schema: 'test-schema',
    };
    const startRequest = {
      request: {
        streamId: 'test-stream-id',
        redisStream,
        indexerConfig: JSON.stringify(indexerConfig),
      }
    } as unknown as any;

    service.StartStream(startRequest, mockCallback);
    service.StartStream(startRequest, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(1);
    expect(genericStreamHandlerType).toHaveBeenCalledWith(redisStream, indexerConfig);
    expect(mockCallback.mock.calls).toEqual([
      [null, { streamId: 'test-stream-id' }],
      [{
        code: grpc.status.ALREADY_EXISTS,
        message: 'Stream test-stream-id can\'t be started as it already exists'
      }, null]
    ]);
  });
});
