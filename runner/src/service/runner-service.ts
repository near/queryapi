import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import { type RunnerHandlers } from '../generated/spec/Runner';
import { type StartExecutorResponse__Output, type StartExecutorResponse } from '../generated/spec/StartExecutorResponse';
import { type StartExecutorRequest__Output } from '../generated/spec/StartExecutorRequest';
import { type UpdateExecutorRequest__Output } from '../generated/spec/UpdateExecutorRequest';
import { type UpdateExecutorResponse__Output, type UpdateExecutorResponse } from '../generated/spec/UpdateExecutorResponse';
import { type StopExecutorRequest__Output } from '../generated/spec/StopExecutorRequest';
import { type StopExecutorResponse__Output, type StopExecutorResponse } from '../generated/spec/StopExecutorResponse';
import { type ListExecutorsRequest__Output } from '../generated/spec/ListExecutorsRequest';
import { type ListExecutorsResponse__Output, type ListExecutorsResponse } from '../generated/spec/ListExecutorsResponse';
import { type ExecutorInfo__Output } from '../generated/spec/ExecutorInfo';
import type StreamHandler from '../stream-handler';
import * as grpc from '@grpc/grpc-js';
import assert from 'assert';

type StreamHandlers = Map<string, StreamHandler>;

function getRunnerService (StreamHandlerType: typeof StreamHandler): RunnerHandlers {
  const streamHandlers: StreamHandlers = new Map();

  const RunnerService: RunnerHandlers = {
    StartExecutor (call: ServerUnaryCall<StartExecutorRequest__Output, StartExecutorResponse>, callback: sendUnaryData<StartExecutorResponse__Output>): void {
      console.log('StartExecutor called');
      // Validate request
      const validationResult = validateStartExecutorRequest(call.request, streamHandlers);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }

      // Handle request
      try {
        const config = JSON.parse(call.request.indexerConfig);
        const streamHandler = new StreamHandlerType(call.request.redisStream, {
          account_id: config.account_id,
          function_name: config.function_name,
          code: config.code,
          schema: config.schema
        });
        streamHandlers.set(call.request.streamId, streamHandler);
        callback(null, { streamId: call.request.streamId });
      } catch (error) {
        callback(handleInternalError(error), null);
      }
    },

    UpdateExecutor (call: ServerUnaryCall<UpdateExecutorRequest__Output, UpdateExecutorResponse>, callback: sendUnaryData<UpdateExecutorResponse__Output>): void {
      console.log('UpdateExecutor called');
      // Validate request
      const validationResult = validateUpdateExecutorRequest(call.request, streamHandlers);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }

      // Handle request
      try {
        const config = JSON.parse(call.request.indexerConfig);
        streamHandlers.get(call.request.streamId)?.updateIndexerConfig({
          account_id: config.account_id,
          function_name: config.function_name,
          code: config.code,
          schema: config.schema
        });
        callback(null, { streamId: call.request.streamId });
      } catch (error) {
        callback(handleInternalError(error), null);
      }
    },

    StopExecutor (call: ServerUnaryCall<StopExecutorRequest__Output, StopExecutorResponse>, callback: sendUnaryData<StopExecutorResponse__Output>): void {
      console.log('StopExecutor called');
      // Validate request
      const validationResult = validateStopExecutorRequest(call.request, streamHandlers);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }

      // Handle request
      const streamId: string = call.request.streamId;
      streamHandlers.get(streamId)?.stop()
        .then(() => {
          streamHandlers.delete(streamId);
          callback(null, { streamId });
        }).catch(error => {
          const grpcError = handleInternalError(error);
          callback(grpcError, null);
        });
    },

    ListExecutors (_: ServerUnaryCall<ListExecutorsRequest__Output, ListExecutorsResponse>, callback: sendUnaryData<ListExecutorsResponse__Output>): void {
      // TODO: Refactor to make use of repeated field
      console.log('ListExecutors called');
      // TODO: Return more information than just streamId
      const response: ExecutorInfo__Output[] = [];
      try {
        streamHandlers.forEach((handler, stream) => {
          response.push({
            streamId: stream,
            indexerName: handler.indexerName,
            status: 'RUNNING' // TODO: Keep updated status in stream handler
          });
        });
        callback(null, {
          streams: response
        });
      } catch (error) {
        callback(handleInternalError(error), null);
      }
    }
  };
  return RunnerService;
}

function handleInternalError (error: unknown): any {
  let errorMessage = 'An unknown error occurred';

  // Check if error is an instance of Error
  if (error instanceof Error) {
    errorMessage = error.message;
  }
  return {
    code: grpc.status.INTERNAL,
    message: errorMessage
  };
}

function validateStringParameter (parameter: string, parameterName: string): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };
  if (parameter === undefined || parameter.trim() === '') {
    grpcError.message = `Invalid ${parameterName}. It must be a non-empty string.`;
    return grpcError;
  }
  return null;
}

function validateIndexerConfig (indexerConfig: string): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };
  const validation = validateStringParameter(indexerConfig, 'indexerConfig');
  if (validation !== null) {
    return validation;
  }
  assert(indexerConfig !== undefined);
  try {
    const config = JSON.parse(indexerConfig);
    if (config.account_id === undefined || config.function_name === undefined || config.code === undefined || config.schema === undefined) {
      grpcError.message = 'Invalid indexer config. It must contain account id, function name, code, and schema.';
      return grpcError;
    }
  } catch (error) {
    grpcError.message = 'Invalid indexer config. It must be a valid JSON string.';
    return grpcError;
  }
  return null;
}

function validateStartExecutorRequest (request: StartExecutorRequest__Output, streamHandlers: StreamHandlers): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };

  // Validate streamId
  let validationResult = validateStringParameter(request.streamId, 'streamId');
  if (validationResult !== null) {
    return validationResult;
  }
  assert(request.streamId !== undefined);
  if (streamHandlers.get(request.streamId) !== undefined) {
    grpcError.message = `Stream Executor ${request.streamId} can't be started as it already exists.`;
    grpcError.code = grpc.status.ALREADY_EXISTS;
    return grpcError;
  }

  // Validate redisStream
  validationResult = validateStringParameter(request.redisStream, 'redisStream');
  if (validationResult !== null) {
    return validationResult;
  }

  // Validate indexerConfig
  validationResult = validateIndexerConfig(request.indexerConfig);
  if (validationResult !== null) {
    return validationResult;
  }
  return null;
}

function validateUpdateExecutorRequest (request: UpdateExecutorRequest__Output, streamHandlers: StreamHandlers): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };

  // Validate streamId
  let validationResult = validateStringParameter(request.streamId, 'streamId');
  if (validationResult !== null) {
    return validationResult;
  }
  assert(request.streamId !== undefined);
  if (streamHandlers.get(request.streamId) === undefined) {
    grpcError.message = `Stream Executor ${request.streamId} cannot be updated as it does not exist.`;
    return grpcError;
  }

  // Validate indexerConfig
  validationResult = validateIndexerConfig(request.indexerConfig);
  if (validationResult !== null) {
    return validationResult;
  }
  return null;
}

function validateStopExecutorRequest (request: StopExecutorRequest__Output, streamHandlers: StreamHandlers): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };

  // Validate streamId
  const validationResult = validateStringParameter(request.streamId, 'streamId');
  if (validationResult !== null) {
    return validationResult;
  }
  assert(request.streamId !== undefined);
  if (streamHandlers.get(request.streamId) === undefined) {
    grpcError.message = `Stream Executor ${request.streamId} cannot be stopped as it does not exist.`;
    return grpcError;
  }

  return null;
}

export default getRunnerService;
