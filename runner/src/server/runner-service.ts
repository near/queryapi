import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import * as grpc from '@grpc/grpc-js';
import assert from 'assert';
import crypto from 'crypto';

import { type RunnerHandlers } from '../generated/runner/Runner';
import { type StartExecutorResponse__Output, type StartExecutorResponse } from '../generated/runner/StartExecutorResponse';
import { type StartExecutorRequest__Output } from '../generated/runner/StartExecutorRequest';
import { type StopExecutorRequest__Output } from '../generated/runner/StopExecutorRequest';
import { type StopExecutorResponse__Output, type StopExecutorResponse } from '../generated/runner/StopExecutorResponse';
import { type ListExecutorsRequest__Output } from '../generated/runner/ListExecutorsRequest';
import { type ListExecutorsResponse__Output, type ListExecutorsResponse } from '../generated/runner/ListExecutorsResponse';
import { type ExecutorInfo__Output } from '../generated/runner/ExecutorInfo';
import type StreamHandler from '../stream-handler';

type StreamHandlers = Map<string, StreamHandler>;

const hashString = (input: string): string => {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
};

function getRunnerService (StreamHandlerType: typeof StreamHandler): RunnerHandlers {
  const streamHandlers: StreamHandlers = new Map();

  const RunnerService: RunnerHandlers = {
    StartExecutor (call: ServerUnaryCall<StartExecutorRequest__Output, StartExecutorResponse>, callback: sendUnaryData<StartExecutorResponse__Output>): void {
      // Validate request
      const validationResult = validateStartExecutorRequest(call.request);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }

      const { accountId, functionName, code, schema, redisStream } = call.request;
      const executorId = hashString(`${accountId}/${functionName}`);

      if (streamHandlers.has(executorId)) {
        const alreadyExistsError = {
          code: grpc.status.ALREADY_EXISTS,
          message: `Executor ${executorId} can't be started as it already exists.`
        };
        callback(alreadyExistsError, null);

        return;
      }

      console.log('Starting executor', accountId, functionName, executorId);

      // Handle request
      try {
        const streamHandler = new StreamHandlerType(redisStream, {
          account_id: accountId,
          function_name: functionName,
          code,
          schema
        });
        streamHandlers.set(executorId, streamHandler);
        callback(null, { executorId });
      } catch (error) {
        callback(handleInternalError(error), null);
      }
    },

    StopExecutor (call: ServerUnaryCall<StopExecutorRequest__Output, StopExecutorResponse>, callback: sendUnaryData<StopExecutorResponse__Output>): void {
      console.log('StopExecutor called on', call.request.executorId);
      // Validate request
      const validationResult = validateStopExecutorRequest(call.request, streamHandlers);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }

      // Handle request
      const executorId: string = call.request.executorId;
      streamHandlers.get(executorId)?.stop()
        .then(() => {
          streamHandlers.delete(executorId);
          callback(null, { executorId });
        }).catch(error => {
          const grpcError = handleInternalError(error);
          callback(grpcError, null);
        });
    },

    ListExecutors (_: ServerUnaryCall<ListExecutorsRequest__Output, ListExecutorsResponse>, callback: sendUnaryData<ListExecutorsResponse__Output>): void {
      // TODO: Refactor to make use of repeated field
      console.log('ListExecutors called');
      // TODO: Return more information than just executorId
      const response: ExecutorInfo__Output[] = [];
      try {
        streamHandlers.forEach((handler, executorId) => {
          if (handler.indexerConfig?.account_id === undefined || handler.indexerConfig?.function_name === undefined) {
            throw new Error(`Stream handler ${executorId} has no/invalid indexer config.`);
          }
          response.push({
            executorId,
            accountId: handler.indexerConfig?.account_id,
            functionName: handler.indexerConfig?.function_name,
            status: 'RUNNING' // TODO: Keep updated status in stream handler
          });
        });
        callback(null, {
          executors: response
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

function validateStringParameter (parameterName: string, parameterValue: string): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };

  if (parameterValue === undefined || parameterValue.trim() === '') {
    grpcError.message = `Invalid ${parameterName}. It must be a non-empty string.`;
    return grpcError;
  }
  return null;
}

function validateStartExecutorRequest (request: StartExecutorRequest__Output): any | null {
  // Validate request parameters
  let validationResult = validateStringParameter('redisStream', request.redisStream);
  if (validationResult !== null) {
    return validationResult;
  }

  validationResult = validateStringParameter('accountId', request.accountId);
  if (validationResult !== null) {
    return validationResult;
  }

  validationResult = validateStringParameter('functionName', request.functionName);
  if (validationResult !== null) {
    return validationResult;
  }

  validationResult = validateStringParameter('code', request.code);
  if (validationResult !== null) {
    return validationResult;
  }

  validationResult = validateStringParameter('schema', request.schema);
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

  // Validate executorId
  const validationResult = validateStringParameter('executorId', request.executorId);
  if (validationResult !== null) {
    return validationResult;
  }
  assert(request.executorId !== undefined);
  if (streamHandlers.get(request.executorId) === undefined) {
    grpcError.message = `Executor ${request.executorId} cannot be stopped as it does not exist.`;
    return grpcError;
  }

  return null;
}

export default getRunnerService;
