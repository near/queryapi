import { type RunnerHandlers } from '../generated/spec/Runner';
import type StreamHandler from '../stream-handler/stream-handler';
import getRunnerService from './runner-service';
import * as grpc from '@grpc/grpc-js';

let BASIC_STREAM_ID = 'test-stream-id';
let BASIC_REDIS_STREAM = 'test-redis-stream';
let BASIC_INDEXER_CONFIG = {
  account_id: 'test-account-id',
  function_name: 'test-function-name',
  code: 'test-code',
  schema: 'test-schema',
};

beforeEach(() => {
  BASIC_STREAM_ID = 'test-stream-id';
  BASIC_REDIS_STREAM = 'test-redis-stream';
  BASIC_INDEXER_CONFIG = {
    account_id: 'test-account-id',
    function_name: 'test-function-name',
    code: 'test-code',
    schema: 'test-schema',
  };
});

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
    const request = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, JSON.stringify(BASIC_INDEXER_CONFIG));

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledWith(BASIC_REDIS_STREAM, BASIC_INDEXER_CONFIG);
    expect(mockCallback).toHaveBeenCalledWith(null, { streamId: BASIC_STREAM_ID });
  });

  it('Invalid start stream request with empty stream Id', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest('', BASIC_REDIS_STREAM, JSON.stringify(BASIC_INDEXER_CONFIG));

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid streamId. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start stream request with missing redis stream Id parameter', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, undefined, JSON.stringify(BASIC_INDEXER_CONFIG));

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid redisStream. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start stream request with missing indexer config parameter', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, undefined);

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexerConfig. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start stream request with missing code parameter in indexerConfig', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, JSON.stringify(
      {
        account_id: 'test-account-id',
        function_name: 'test-function-name',
        schema: 'test-schema',
      }
    ));

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexer config. It must contain account id, function name, code, and schema.'
    }, null);
  });

  it('Invalid start stream request with invalid JSON for indexerConfig', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, '{');

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexer config. It must be a valid JSON string.'
    }, null);
  });

  it('starts a stream twice with correct settings, gets error second time', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const indexerConfig = {
      account_id: 'test-account-id',
      function_name: 'test-function-name',
      code: 'test-code',
      schema: 'test-schema',
    };
    const startRequest = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, JSON.stringify(indexerConfig));

    service.StartExecutor(startRequest, mockCallback);
    service.StartExecutor(startRequest, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(1);
    expect(genericStreamHandlerType).toHaveBeenCalledWith(BASIC_REDIS_STREAM, indexerConfig);
    expect(mockCallback.mock.calls).toEqual([
      [null, { streamId: BASIC_STREAM_ID }],
      [{
        code: grpc.status.ALREADY_EXISTS,
        message: `Stream Executor ${BASIC_STREAM_ID} can't be started as it already exists.`
      }, null]
    ]);
  });

  it('updates a stream with correct settings', () => {
    const updateIndexerConfig = jest.fn();
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { updateIndexerConfig };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const indexerConfig = BASIC_INDEXER_CONFIG;
    const startRequest = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, JSON.stringify(indexerConfig));

    service.StartExecutor(startRequest, mockCallback);

    indexerConfig.code = 'test-code-2';
    const updateRequest = generateRequest(BASIC_STREAM_ID, undefined, JSON.stringify(indexerConfig));

    service.UpdateExecutor(updateRequest, mockCallback);

    indexerConfig.code = 'test-code';
    expect(streamHandlerType).toHaveBeenCalledTimes(1);
    indexerConfig.code = 'test-code-2';
    expect(updateIndexerConfig.mock.calls).toEqual([
      [indexerConfig]
    ]);
    expect(mockCallback).toHaveBeenCalledWith(null, { streamId: BASIC_STREAM_ID });
    expect(mockCallback.mock.calls).toEqual([
      [null, { streamId: BASIC_STREAM_ID }],
      [null, { streamId: BASIC_STREAM_ID }],
    ]);
  });

  it('Invalid update stream request with empty stream Id', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest('', undefined, JSON.stringify(BASIC_INDEXER_CONFIG));

    service.UpdateExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid streamId. It must be a non-empty string.'
    }, null);
  });

  it('Invalid update stream request with non-existent stream', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, undefined, JSON.stringify(BASIC_INDEXER_CONFIG));

    service.UpdateExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: `Stream Executor ${BASIC_STREAM_ID} cannot be updated as it does not exist.`
    }, null);
  });

  it('Invalid start stream request with missing indexer config parameter', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, undefined);

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexerConfig. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start stream request with missing code parameter in indexerConfig', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, JSON.stringify(
      {
        account_id: 'test-account-id',
        function_name: 'test-function-name',
        schema: 'test-schema',
      }
    ));

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexer config. It must contain account id, function name, code, and schema.'
    }, null);
  });

  it('Invalid start stream request with invalid JSON for indexerConfig', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, '{');

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid indexer config. It must be a valid JSON string.'
    }, null);
  });

  it('stops a stream with correct settings', async () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const requestA = generateRequest(BASIC_STREAM_ID + '-A', BASIC_REDIS_STREAM + '-A', JSON.stringify(BASIC_INDEXER_CONFIG));
    const requestB = generateRequest(BASIC_STREAM_ID + '-B', BASIC_REDIS_STREAM + '-B', JSON.stringify(BASIC_INDEXER_CONFIG));

    service.StartExecutor(requestA, mockCallback);
    service.StartExecutor(requestB, mockCallback);

    const stopRequest = generateRequest(BASIC_STREAM_ID + '-A', undefined, undefined); // Stops stream A

    await new Promise((resolve, reject) => {
      service.StopExecutor(stopRequest, function (err, response) {
        if (err) {
          reject(err); return;
        }
        mockCallback(err, response);
        resolve(response);
      });
    });

    service.StartExecutor(requestA, mockCallback);

    expect(streamHandlerType).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mockCallback.mock.calls).toEqual([
      [null, { streamId: BASIC_STREAM_ID + '-A' }], // Start A
      [null, { streamId: BASIC_STREAM_ID + '-B' }], // Start B
      [null, { streamId: BASIC_STREAM_ID + '-A' }], // Stop A
      [null, { streamId: BASIC_STREAM_ID + '-A' }], // Stop B
    ]);
  });

  it('Invalid stop stream request with empty stream Id', () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest('', undefined, undefined);

    service.StopExecutor(request, mockCallback);

    expect(stop).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid streamId. It must be a non-empty string.'
    }, null);
  });

  it('Invalid stop stream request with non-existent stream', () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_STREAM_ID, undefined, undefined);

    service.StopExecutor(request, mockCallback);

    expect(stop).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: `Stream Executor ${BASIC_STREAM_ID} cannot be stopped as it does not exist.`
    }, null);
  });

  it('Invalid stop stream request with somehow failing stop', async () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.reject(new Error('somehow fails'));
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const startRequest = generateRequest(BASIC_STREAM_ID, BASIC_REDIS_STREAM, JSON.stringify(BASIC_INDEXER_CONFIG));
    const stopRequest = generateRequest(BASIC_STREAM_ID, undefined, undefined);

    service.StartExecutor(startRequest, mockCallback);

    await new Promise((resolve, reject) => {
      service.StopExecutor(stopRequest, function (err, response) {
        if (err) { // Should get somehow fails error
          mockCallback(err, response);
          resolve(err.details); return;
        }
        reject(err);
      });
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(mockCallback.mock.calls).toEqual([
      [null, { streamId: BASIC_STREAM_ID }],
      [{
        code: grpc.status.INTERNAL,
        message: 'somehow fails'
      }, null]
    ]);
  });

  it('valid list stream request lists streams correctly', async () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation((...args) => {
      return {
        stop,
        indexerName: `${args[1].account_id as string}/${args[1].function_name as string}`,
      };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const requestA = generateRequest(BASIC_STREAM_ID + '-A', BASIC_REDIS_STREAM + '-A', JSON.stringify(BASIC_INDEXER_CONFIG));
    const requestB = generateRequest(BASIC_STREAM_ID + '-B', BASIC_REDIS_STREAM + '-B', JSON.stringify(BASIC_INDEXER_CONFIG));
    const listRequest = generateRequest(undefined, undefined, undefined);
    const stopRequest = generateRequest(BASIC_STREAM_ID + '-A', undefined, undefined); // Stops stream A

    await listExecutorsPromise(listRequest, service, mockCallback);

    service.StartExecutor(requestA, mockCallback);

    await listExecutorsPromise(listRequest, service, mockCallback);

    service.StartExecutor(requestB, mockCallback);

    await listExecutorsPromise(listRequest, service, mockCallback);

    await new Promise((resolve, reject) => {
      service.StopExecutor(stopRequest, function (err, response) {
        if (err) {
          reject(err); return;
        }
        mockCallback(err, response);
        resolve(response);
      });
    });

    await listExecutorsPromise(listRequest, service, mockCallback);

    service.StartExecutor(requestA, mockCallback);

    await listExecutorsPromise(listRequest, service, mockCallback);

    expect(streamHandlerType).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(1);
    const emptyList: never[] = [];
    const oneStreamList = [{
      streamId: BASIC_STREAM_ID + '-A',
      indexerName: BASIC_INDEXER_CONFIG.account_id + '/' + BASIC_INDEXER_CONFIG.function_name,
      status: 'RUNNING'
    }];
    const twoStreamList = [{
      streamId: BASIC_STREAM_ID + '-A',
      indexerName: BASIC_INDEXER_CONFIG.account_id + '/' + BASIC_INDEXER_CONFIG.function_name,
      status: 'RUNNING'
    },
    {
      streamId: BASIC_STREAM_ID + '-B',
      indexerName: BASIC_INDEXER_CONFIG.account_id + '/' + BASIC_INDEXER_CONFIG.function_name,
      status: 'RUNNING'
    }];
    expect(mockCallback.mock.calls[0][1]).toEqual({ streams: emptyList });
    expect(mockCallback.mock.calls[2][1]).toEqual({ streams: oneStreamList });
    expect(mockCallback.mock.calls[4][1]).toEqual({ streams: twoStreamList });
    oneStreamList[0].streamId = BASIC_STREAM_ID + '-B';
    expect(mockCallback.mock.calls[6][1]).toEqual({ streams: oneStreamList }); // After stop was called
    twoStreamList[0].streamId = BASIC_STREAM_ID + '-B';
    twoStreamList[1].streamId = BASIC_STREAM_ID + '-A';
    expect(mockCallback.mock.calls[8][1]).toEqual({ streams: twoStreamList }); // Order is reversed now
  });
});

async function listExecutorsPromise (listRequest: any, service: RunnerHandlers, mockCallback: jest.Mock<any, any>): Promise<any> {
  await new Promise((resolve, reject) => {
    service.ListExecutors(listRequest, function (err, response) {
      if (err) {
        reject(err); return;
      }
      mockCallback(err, response);
      resolve(response);
    });
  });
}

function generateRequest (streamId: string | undefined = undefined, redisStream: string | undefined = undefined, indexerConfig: string | undefined = undefined): any {
  const request = {
    ...(streamId !== undefined && { streamId }),
    ...(redisStream !== undefined && { redisStream }),
    ...(indexerConfig !== undefined && { indexerConfig }),
  };
  return {
    request
  };
}
