import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import * as grpc from '@grpc/grpc-js';
import { Status } from '../stream-handler/stream-handler';
import crypto from 'crypto';

import { type RunnerHandlers } from '../generated/runner/Runner';
import { type StartExecutorResponse__Output, type StartExecutorResponse } from '../generated/runner/StartExecutorResponse';
import { type StartExecutorRequest__Output } from '../generated/runner/StartExecutorRequest';
import { type StopExecutorRequest__Output } from '../generated/runner/StopExecutorRequest';
import { type StopExecutorResponse__Output, type StopExecutorResponse } from '../generated/runner/StopExecutorResponse';
import { type ListExecutorsRequest__Output } from '../generated/runner/ListExecutorsRequest';
import { type ListExecutorsResponse__Output, type ListExecutorsResponse } from '../generated/runner/ListExecutorsResponse';
import { type ExecutorInfo__Output } from '../generated/runner/ExecutorInfo';
import StreamHandler from '../stream-handler';

const hashString = (input: string): string => {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
};

function getRunnerService (executors: Map<string, StreamHandler>, StreamHandlerType: typeof StreamHandler = StreamHandler): RunnerHandlers {
  const RunnerService: RunnerHandlers = {
    StartExecutor (call: ServerUnaryCall<StartExecutorRequest__Output, StartExecutorResponse>, callback: sendUnaryData<StartExecutorResponse__Output>): void {
      // Validate request
      const validationResult = validateStartExecutorRequest(call.request);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }

      const { accountId, functionName, code, schema, redisStream, version } = call.request;
      const executorId = hashString(`${accountId}/${functionName}`);

      if (executors.has(executorId)) {
        const alreadyExistsError = {
          code: grpc.status.ALREADY_EXISTS,
          message: `Executor ${executorId} can't be started as it already exists.`
        };
        callback(alreadyExistsError, null);

        return;
      }

      console.log('Starting executor: ', { accountId, functionName, executorId, version });

      // Handle request
      try {
        const streamHandler = new StreamHandlerType(redisStream, {
          account_id: accountId,
          function_name: functionName,
          version: Number(version),
          code,
          schema,
          status: Status.RUNNING
        });
        executors.set(executorId, streamHandler);
        callback(null, { executorId });
      } catch (error) {
        callback(handleInternalError(error), null);
      }
    },

    StopExecutor (call: ServerUnaryCall<StopExecutorRequest__Output, StopExecutorResponse>, callback: sendUnaryData<StopExecutorResponse__Output>): void {
      const executorId: string = call.request.executorId;
      // Validate request
      const validationResult = validateStopExecutorRequest(call.request);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }
      if (executors.get(executorId) === undefined) {
        const notFoundError = {
          code: grpc.status.NOT_FOUND,
          message: `Executor ${executorId} cannot be stopped as it does not exist.`
        };
        callback(notFoundError, null);
        return;
      }

      console.log('Stopping executor: ', { executorId });

      // Handle request
      executors.get(executorId)?.stop()
        .then(() => {
          executors.delete(executorId);
          callback(null, { executorId });
        }).catch(error => {
          const grpcError = handleInternalError(error);
          callback(grpcError, null);
        });
    },

    ListExecutors (_: ServerUnaryCall<ListExecutorsRequest__Output, ListExecutorsResponse>, callback: sendUnaryData<ListExecutorsResponse__Output>): void {
      const response: ExecutorInfo__Output[] = [];
      try {
        executors.forEach((handler, executorId) => {
          let config = handler.getIndexerConfig();
          if (config === undefined) {
            // TODO: Throw error instead when V1 is deprecated
            config = {
              account_id: '',
              function_name: '',
              version: -1, // Ensure Coordinator V2 sees version mismatch
              code: '',
              schema: '',
              status: Status.RUNNING
            };
          }
          response.push({
            executorId,
            accountId: config.account_id,
            functionName: config.function_name,
            version: config.version.toString(),
            status: config.status
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
  console.error(errorMessage);
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

function validateStopExecutorRequest (request: StopExecutorRequest__Output): any | null {
  // Validate executorId
  const validationResult = validateStringParameter('executorId', request.executorId);
  if (validationResult !== null) {
    return validationResult;
  }

  return null;
}

export default getRunnerService;
