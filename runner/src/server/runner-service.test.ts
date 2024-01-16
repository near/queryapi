import type StreamHandler from '../stream-handler/stream-handler';
import { Status } from '../stream-handler/stream-handler';
import getRunnerService from './runner-service';
import * as grpc from '@grpc/grpc-js';

const BASIC_REDIS_STREAM = 'test-redis-stream';
const BASIC_ACCOUNT_ID = 'test-account-id';
const BASIC_FUNCTION_NAME = 'test-function-name';
// Deterministic ID for above account ID/function name
const BASIC_EXECUTOR_ID = '964551da443042a0c834d5fe9bb2c07023b69f1528404f0f0a3fc8a27c2d1c44';
const BASIC_CODE = 'test-code';
const BASIC_SCHEMA = 'test-schema';
const BASIC_VERSION = 1;
const BASIC_INDEXER_CONFIG = {
  account_id: BASIC_ACCOUNT_ID,
  function_name: BASIC_FUNCTION_NAME,
  code: BASIC_CODE,
  schema: BASIC_SCHEMA,
  version: BASIC_VERSION,
  status: Status.RUNNING
};

describe('Runner gRPC Service', () => {
  let genericStreamHandlerType: typeof StreamHandler;
  beforeEach(() => {
    process.env.RUNNER_VERSION = 'V2';
    genericStreamHandlerType = jest.fn().mockImplementation((...args) => {
      return {
        updateIndexerConfig: jest.fn(),
        indexerConfig: { account_id: args[1].account_id, function_name: args[1].function_name }
      };
    });
  });

  it('starts a executor with correct settings', () => {
    const service = getRunnerService(new Map(), genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA, BASIC_VERSION);

    service.StartExecutor(request, mockCallback);

    expect(genericStreamHandlerType).toHaveBeenCalledWith(BASIC_REDIS_STREAM, BASIC_INDEXER_CONFIG);
    expect(mockCallback).toHaveBeenCalledWith(null, { executorId: BASIC_EXECUTOR_ID });
  });

  it('Invalid start executor request with missing redis stream Id parameter', () => {
    const service = getRunnerService(new Map(), genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest(undefined, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(request, mockCallback);

    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid redisStream. It must be a non-empty string.'
    }, null);
    expect(genericStreamHandlerType).toHaveBeenCalledTimes(0);
  });

  it('Invalid start executor request with missing config parameters', () => {
    const service = getRunnerService(new Map(), genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    let request = generateRequest(BASIC_REDIS_STREAM, undefined, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);
    service.StartExecutor(request, mockCallback);

    request = generateRequest(BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, '', BASIC_CODE, BASIC_SCHEMA);
    service.StartExecutor(request, mockCallback);

    request = generateRequest(BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, undefined, BASIC_SCHEMA);
    service.StartExecutor(request, mockCallback);

    request = generateRequest(BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, '');
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
    const service = getRunnerService(new Map(), genericStreamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const startRequest = generateRequest(BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA, BASIC_VERSION);

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

  it('stops a executor with correct settings', (done) => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(new Map(), streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const requestA = generateRequest(BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(requestA, mockCallback);

    service.StopExecutor({ request: { executorId: BASIC_EXECUTOR_ID } } as any, (err, response) => {
      mockCallback(err, response);

      expect(streamHandlerType).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(mockCallback.mock.calls).toEqual([
        [null, { executorId: BASIC_EXECUTOR_ID }], // Start
        [null, { executorId: BASIC_EXECUTOR_ID }], // Stop
      ]);

      done();
    });
  });

  it('Invalid stop executor request with empty executor Id', () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(new Map(), streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const request = generateRequest('');

    service.StopExecutor(request, mockCallback);

    expect(stop).toHaveBeenCalledTimes(0);
    expect(mockCallback).toHaveBeenCalledWith({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Invalid executorId. It must be a non-empty string.'
    }, null);
  });

  it('Invalid stop executor request with non-existent executor', (done) => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(new Map(), streamHandlerType);

    service.StopExecutor({ request: { executorId: 'non-existant' } } as any, (err) => {
      expect(err).toEqual({
        code: grpc.status.NOT_FOUND,
        message: 'Executor non-existant cannot be stopped as it does not exist.'
      });
      expect(stop).toHaveBeenCalledTimes(0);

      done();
    });
  });

  it('Invalid stop executor request with somehow failing stop', (done) => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.reject(new Error('somehow fails'));
    });
    const streamHandlerType = jest.fn().mockImplementation(() => {
      return { stop };
    });
    const service = getRunnerService(new Map(), streamHandlerType);
    const mockCallback = jest.fn() as unknown as any;
    const startRequest = generateRequest(BASIC_REDIS_STREAM, BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA);

    service.StartExecutor(startRequest, mockCallback);

    service.StopExecutor({ request: { executorId: BASIC_EXECUTOR_ID } } as any, (err) => {
      expect(err).toEqual({
        code: grpc.status.INTERNAL,
        message: 'somehow fails'
      });
      expect(stop).toHaveBeenCalledTimes(1);
      expect(mockCallback.mock.calls).toEqual([
        [null, { executorId: BASIC_EXECUTOR_ID }],
      ]);

      done();
    });
  });

  it('valid list executor request lists executors correctly, with stopped indexer', async () => {
    const stop = jest.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const streamHandlerType = jest.fn().mockImplementation((_, indexerConfig) => {
      return {
        stop,
        indexerConfig: {
          account_id: indexerConfig.account_id,
          function_name: indexerConfig.function_name,
          status: indexerConfig.status,
          version: indexerConfig.version
        }
      };
    });
    const service = getRunnerService(new Map(), streamHandlerType);
    const request = generateRequest(BASIC_REDIS_STREAM + '-A', BASIC_ACCOUNT_ID, BASIC_FUNCTION_NAME, BASIC_CODE, BASIC_SCHEMA, BASIC_VERSION);

    await new Promise((resolve, reject) => {
      service.StartExecutor(request, (err) => {
        if (err) reject(err);
        resolve(null);
      });
    });

    await new Promise((resolve, reject) => {
      service.ListExecutors({} as any, (err, response) => {
        if (err) reject(err);
        expect(response).toEqual({
          executors: [{
            executorId: BASIC_EXECUTOR_ID,
            accountId: BASIC_INDEXER_CONFIG.account_id,
            functionName: BASIC_INDEXER_CONFIG.function_name,
            status: 'RUNNING',
            version: '1'
          }]
        });
        resolve(null);
      });
    });

    await new Promise((resolve, reject) => {
      service.StopExecutor({ request: { executorId: BASIC_EXECUTOR_ID } } as any, (err) => {
        if (err) reject(err);
        resolve(null);
      });
    });

    await new Promise((resolve, reject) => {
      service.ListExecutors({} as any, (err, response) => {
        if (err) reject(err);
        expect(response).toEqual({
          executors: []
        });
        resolve(null);
      });
    });
  });
});

function generateRequest (
  redisStream?: string,
  accountId?: string,
  functionName?: string,
  code?: string,
  schema?: string,
  version?: number): any {
  const request = {
    ...(redisStream && { redisStream }),
    ...(accountId && { accountId }),
    ...(functionName && { functionName }),
    ...(code && { code }),
    ...(schema && { schema }),
    ...(version && { version: Number(version) })
  };
  return {
    request
  };
}
