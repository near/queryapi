import { type RunnerHandlers } from '../generated/runner/Runner';
import type StreamHandler from '../stream-handler/stream-handler';
import getRunnerService from './runner-service';
import * as grpc from '@grpc/grpc-js';

const BASIC_EXECUTOR_ID = 'test-executor-id';
const BASIC_REDIS_STREAM = 'test-redis-stream';
const BASIC_ACCOUNT_ID = 'test-account-id';
const BASIC_FUNCTION_NAME = 'test-function-name';
const BASIC_CODE = 'test-code';
const BASIC_SCHEMA = 'test-schema';
const BASIC_INDEXER_CONFIG = {
  account_id: BASIC_ACCOUNT_ID,
  function_name: BASIC_FUNCTION_NAME,
  code: BASIC_CODE,
  schema: BASIC_SCHEMA,
};

describe('Runner gRPC Service', () => {
  let genericStreamHandlerType: typeof StreamHandler;
  beforeEach(() => {
    genericStreamHandlerType = jest.fn().mockImplementation((...args) => {
      return {
        updateIndexerConfig: jest.fn(),
        indexerConfig: { account_id: args[1].account_id, function_name: args[1].function_name }
      };
    });
  });

  it('starts a executor with correct settings', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_EXECUTOR_ID, BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledWith(BASIC_REDIS_STREAM, BASIC_INDEXER_CONFIG);
    expect(mockCallback).toHaveBeenCalledWith(null, { executorId: BASIC_EXECUTOR_ID });
  });

  it('Invalid start executor request with empty executor Id', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest('', BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid executorId. It must be a non-empty string.'
    }, null);
  });

  it('Invalid start executor request with missing redis stream Id parameter', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_EXECUTOR_ID, undefined, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(request, mockCallback);

    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid redisStream. It must be a non-empty string.'
    }, null);
    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
  });

  it('Invalid start executor request with missing config parameters', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    let request = generateRequest(BASIC_EXECUTOR_ID, BASIC_REDIS_STREAM, undefined, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);
    service.StartExecutor(request, mockCallback);

    request = generateRequest(BASIC_EXECUTOR_ID, BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, '', BASIC_CODE, BASIC_SCHEMA);
    service.StartExecutor(request, mockCallback);

    request = generateRequest(BASIC_EXECUTOR_ID, BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, undefined, BASIC_SCHEMA);
    service.StartExecutor(request, mockCallback);

    request = generateRequest(BASIC_EXECUTOR_ID, BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, '');
    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
    expect(mockCallback.mock.calls).toEqual([
      [{
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Invalid accountId. It must be a non-empty string.'
      }, null],
      [{
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Invalid functionName. It must be a non-empty string.'
      }, null],
      [{
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Invalid code. It must be a non-empty string.'
      }, null],
      [{
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Invalid schema. It must be a non-empty string.'
      }, null]
    ]);
  });

  it('starts a executor twice with correct settings, gets error second time', () => {
    const service = getRunnerService(genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const startRequest = generateRequest(BASIC_EXECUTOR_ID, BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(startRequest, mockCallback);
    service.StartExecutor(startRequest, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledTimes(1);
    expect(genericStreamHandlerType).toHaveBeenCalledWith(BASIC_REDIS_STREAM, BASIC_INDEXER_CONFIG);
    expect(mockCallback.mock.calls).toEqual([
      [null, { executorId: BASIC_EXECUTOR_ID }],
      [{
        code: grpc.status.ALREADY_EXISTS,
        message: `Executor ${BASIC_EXECUTOR_ID} can't be started as it already exists.`
      }, null]
    ]);
  });

  it('stops a executor with correct settings', async () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const requestA = generateRequest(BASIC_EXECUTOR_ID + '-A', BASIC_REDIS_STREAM + '-A', BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);
    const requestB = generateRequest(BASIC_EXECUTOR_ID + '-B', BASIC_REDIS_STREAM + '-B', BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(requestA, mockCallback);
    service.StartExecutor(requestB, mockCallback);

    const stopRequest = generateRequest(BASIC_EXECUTOR_ID + '-A', undefined, undefined); // Stops executor A

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
      [null, { executorId: BASIC_EXECUTOR_ID + '-A' }], // Start A
      [null, { executorId: BASIC_EXECUTOR_ID + '-B' }], // Start B
      [null, { executorId: BASIC_EXECUTOR_ID + '-A' }], // Stop A
      [null, { executorId: BASIC_EXECUTOR_ID + '-A' }], // Stop B
    ]);
  });

  it('Invalid stop executor request with empty executor Id', () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest('');

    service.StopExecutor(request, mockCallback);

    expect(stop).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid executorId. It must be a non-empty string.'
    }, null);
  });

  it('Invalid stop executor request with non-existent executor', () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_EXECUTOR_ID, undefined, undefined);

    service.StopExecutor(request, mockCallback);

    expect(stop).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: `Executor ${BASIC_EXECUTOR_ID} cannot be stopped as it does not exist.`
    }, null);
  });

  it('Invalid stop executor request with somehow failing stop', async () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.reject(new Error('somehow fails'));
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const startRequest = generateRequest(BASIC_EXECUTOR_ID, BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);
    const stopRequest = generateRequest(BASIC_EXECUTOR_ID, undefined, undefined);

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
      [null, { executorId: BASIC_EXECUTOR_ID }],
      [{
        code: grpc.status.INTERNAL,
        message: 'somehow fails'
      }, null]
    ]);
  });

  it('valid list executor request lists executors correctly', async () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation((...args) => {
      return {
        stop,
        indexerConfig: { account_id: args[1].account_id, function_name: args[1].function_name },
      };
    });
    const service = getRunnerService(streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const requestA = generateRequest(BASIC_EXECUTOR_ID + '-A', BASIC_REDIS_STREAM + '-A', BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);
    const requestB = generateRequest(BASIC_EXECUTOR_ID + '-B', BASIC_REDIS_STREAM + '-B', BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);
    const listRequest = generateRequest(undefined, undefined, undefined);
    const stopRequest = generateRequest(BASIC_EXECUTOR_ID + '-A', undefined, undefined); // Stops executor A

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
    const oneExecutorList = [{
      executorId: BASIC_EXECUTOR_ID + '-A',
      accountId: BASIC_INDEXER_CONFIG.account_id,
      functionName: BASIC_INDEXER_CONFIG.function_name,
      status: 'RUNNING'
    }];
    const twoExecutorList = [{
      executorId: BASIC_EXECUTOR_ID + '-A',
      accountId: BASIC_INDEXER_CONFIG.account_id,
      functionName: BASIC_INDEXER_CONFIG.function_name,
      status: 'RUNNING'
    },
    {
      executorId: BASIC_EXECUTOR_ID + '-B',
      accountId: BASIC_INDEXER_CONFIG.account_id,
      functionName: BASIC_INDEXER_CONFIG.function_name,
      status: 'RUNNING'
    }];
    expect(mockCallback.mock.calls[0][1]).toEqual({ executors: emptyList });
    expect(mockCallback.mock.calls[2][1]).toEqual({ executors: oneExecutorList });
    expect(mockCallback.mock.calls[4][1]).toEqual({ executors: twoExecutorList });
    oneExecutorList[0].executorId = BASIC_EXECUTOR_ID + '-B';
    expect(mockCallback.mock.calls[6][1]).toEqual({ executors: oneExecutorList }); // After stop was called
    twoExecutorList[0].executorId = BASIC_EXECUTOR_ID + '-B';
    twoExecutorList[1].executorId = BASIC_EXECUTOR_ID + '-A';
    expect(mockCallback.mock.calls[8][1]).toEqual({ executors: twoExecutorList }); // Order is reversed now
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

function generateRequest (
  executorId: string | undefined = undefined,
  redisStream: string | undefined = undefined,
  accountId: string | undefined = undefined,
  functionName: string | undefined = undefined,
  code: string | undefined = undefined,
  schema: string | undefined = undefined): any {
  const request = {
    ...(executorId !== undefined && { executorId }),
    ...(redisStream !== undefined && { redisStream }),
    ...(accountId !== undefined && { accountId }),
    ...(functionName !== undefined && { functionName }),
    ...(code !== undefined && { code }),
    ...(schema !== undefined && { schema }),
  };
  return {
    request
  };
}
