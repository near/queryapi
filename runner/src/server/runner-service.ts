import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import * as grpc from '@grpc/grpc-js';

import { type RunnerHandlers } from '../generated/runner/Runner';
import { type StartExecutorResponse__Output, type StartExecutorResponse } from '../generated/runner/StartExecutorResponse';
import { type StartExecutorRequest__Output } from '../generated/runner/StartExecutorRequest';
import { type StopExecutorRequest__Output } from '../generated/runner/StopExecutorRequest';
import { type StopExecutorResponse__Output, type StopExecutorResponse } from '../generated/runner/StopExecutorResponse';
import { type ListExecutorsRequest__Output } from '../generated/runner/ListExecutorsRequest';
import { type ListExecutorsResponse__Output, type ListExecutorsResponse } from '../generated/runner/ListExecutorsResponse';
import { type ExecutorInfo__Output } from '../generated/runner/ExecutorInfo';
import StreamHandler from '../stream-handler';
import IndexerConfig from '../indexer-config';
import parentLogger from '../logger';

function getRunnerService (executors: Map<string, StreamHandler>, StreamHandlerType: typeof StreamHandler = StreamHandler): RunnerHandlers {
  const RunnerService: RunnerHandlers = {
    StartExecutor (call: ServerUnaryCall<StartExecutorRequest__Output, StartExecutorResponse>, callback: sendUnaryData<StartExecutorResponse__Output>): void {
      // Validate request
      const validationResult = validateStartExecutorRequest(call.request);
      if (validationResult !== null) {
        callback(validationResult, null);
        return;
      }

      const indexerConfig: IndexerConfig = IndexerConfig.fromStartRequest(call.request);

      const logger = parentLogger.child({
        executorId: indexerConfig.executorId,
        accountId: indexerConfig.accountId,
        functionName: indexerConfig.functionName,
        version: indexerConfig.version,
        service: 'RunnerService'
      });

      if (executors.has(indexerConfig.executorId)) {
        const alreadyExistsError = {
          code: grpc.status.ALREADY_EXISTS,
          message: `Executor ${indexerConfig.executorId} can't be started as it already exists.`
        };
        callback(alreadyExistsError, null);

        return;
      }

      logger.info('Starting executor');

      // Handle request
      try {
        const streamHandler = new StreamHandlerType(indexerConfig);
        executors.set(indexerConfig.executorId, streamHandler);
        callback(null, { executorId: indexerConfig.executorId });
      } catch (e) {
        const error = e as Error;

        logger.error('Failed to start executor', error);

        const internalError = {
          code: grpc.status.INTERNAL,
          message: error.message
        };

        callback(internalError, null);
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

      const executor = executors.get(executorId);

      if (!executor) {
        const notFoundError = {
          code: grpc.status.NOT_FOUND,
          message: `Executor ${executorId} cannot be stopped as it does not exist.`
        };
        callback(notFoundError, null);
        return;
      }

      const indexerConfig = executor.indexerConfig;

      const logger = parentLogger.child({
        executorId: indexerConfig.executorId,
        accountId: indexerConfig.accountId,
        functionName: indexerConfig.functionName,
        version: indexerConfig.version,
        service: 'RunnerService'
      });

      logger.info('Stopping executor');

      executor.stop()
        .then(() => {
          executors.delete(executorId);
          callback(null, { executorId });
        }).catch(error => {
          logger.error('Failed to stop exectuor', error);

          const internalError = {
            code: grpc.status.INTERNAL,
            message: error.message
          };

          callback(internalError, null);
        });
    },

    ListExecutors (_: ServerUnaryCall<ListExecutorsRequest__Output, ListExecutorsResponse>, callback: sendUnaryData<ListExecutorsResponse__Output>): void {
      const response: ExecutorInfo__Output[] = [];
      try {
        executors.forEach((handler, executorId) => {
          const indexerConfig = handler.indexerConfig;
          const indexerContext = handler.executorContext;
          response.push({
            executorId,
            accountId: indexerConfig.accountId,
            functionName: indexerConfig.functionName,
            version: indexerConfig.version.toString(),
            status: indexerContext.status
          });
        });
        callback(null, {
          executors: response
        });
      } catch (e) {
        const error = e as Error;

        parentLogger.child({ service: 'RunnerService' }).error('Failed to list executors', error);

        const internalError = {
          code: grpc.status.INTERNAL,
          message: error.message
        };

        callback(internalError, null);
      }
    }
  };
  return RunnerService;
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
