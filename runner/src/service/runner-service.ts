import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import { type RunnerHandlers } from '../generated/spec/Runner';
import { type StartStreamResponse } from '../generated/spec/StartStreamResponse';
import { type StartStreamRequest } from '../generated/spec/StartStreamRequest';
import { type UpdateStreamRequest } from '../generated/spec/UpdateStreamRequest';
import { type UpdateStreamResponse } from '../generated/spec/UpdateStreamResponse';
import { type StopStreamRequest } from '../generated/spec/StopStreamRequest';
import { type StopStreamResponse } from '../generated/spec/StopStreamResponse';
import { type ListStreamsRequest } from '../generated/spec/ListStreamsRequest';
import { type ListStreamsResponse } from '../generated/spec/ListStreamsResponse';
import StreamHandler from '../stream-handler';
import * as grpc from '@grpc/grpc-js';
import assert from 'assert';

type StreamHandlers = Map<string, StreamHandler>;
const streamHandlers: StreamHandlers = new Map();

const RunnerService: RunnerHandlers = {
  StartStream (call: ServerUnaryCall<StartStreamRequest, StartStreamResponse>, callback: sendUnaryData<StartStreamResponse>): void {
    console.log('StartStream called', call.request);
    // Validate request
    const validationResult = validateStartStreamRequest(call.request);
    if (validationResult !== null) {
      callback(validationResult, null);
      return;
    }

    // Handle request
    try {
      assert(call.request.streamId !== undefined && call.request.redisStream !== undefined, 'Validation failed to catch invalid start request');
      const streamHandler = new StreamHandler(call.request.redisStream); // TODO: Supply validated IndexerConfig
      streamHandlers.set(call.request.streamId, streamHandler);
      callback(null, { streamId: call.request.streamId });
    } catch (error) {
      callback(handleInternalError(error), null);
    }
  },

  UpdateStream (call: ServerUnaryCall<UpdateStreamRequest, UpdateStreamResponse>, callback: sendUnaryData<UpdateStreamResponse>): void {
    console.log('UpdateStream called', call.request);
    // Validate request
    const validationResult = validateUpdateStreamRequest(call.request);
    if (validationResult !== null) {
      callback(validationResult, null);
      return;
    }

    // Handle request
    try {
      assert(call.request.streamId !== undefined && call.request.indexerConfig !== undefined, 'Validation failed to catch invalid update request');
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

  StopStream (call: ServerUnaryCall<StopStreamRequest, StopStreamResponse>, callback: sendUnaryData<StopStreamResponse>): void {
    console.log('StopStream called', call.request);
    // Validate request
    const validationResult = validateStopStreamRequest(call.request);
    if (validationResult !== null) {
      callback(validationResult, null);
      return;
    }

    // Handle request
    assert(call.request.streamId !== undefined, 'Validation failed to catch invalid stop request');
    const streamId: string = call.request.streamId;
    streamHandlers.get(streamId)?.stop()
      .then(() => {
        callback(null, { streamId });
        streamHandlers.delete(streamId);
      }).catch(error => {
        const grpcError = handleInternalError(error);
        callback(grpcError, null);
      });
  },

  ListStreams (call: ServerUnaryCall<ListStreamsRequest, ListStreamsResponse>, callback: sendUnaryData<ListStreamsResponse>): void {
    console.log('ListStreams called', call.request);
    // TODO: Return more information than just streamId
    callback(null, {
      streams: Object.keys(streamHandlers).map(stream => {
        return { streamId: stream };
      })
    });
  }
};

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

function validateStringParameter (parameter: string | undefined, parameterName: string): any | null {
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

function validateIndexerConfig (indexerConfig: string | undefined): any | null {
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

function validateStartStreamRequest (request: StartStreamRequest): any | null {
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
    grpcError.message = `Stream ${request.streamId} can't be started as it already exists`;
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

function validateUpdateStreamRequest (request: StartStreamRequest): any | null {
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
    grpcError.message = `Stream ${request.streamId} cannot be updated as it does not exist`;
    return grpcError;
  }

  // Validate indexerConfig
  validationResult = validateIndexerConfig(request.indexerConfig);
  if (validationResult !== null) {
    return validationResult;
  }
  return null;
}

function validateStopStreamRequest (request: StartStreamRequest): any | null {
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
    grpcError.message = `Stream ${request.streamId} cannot be stopped as it does not exist`;
    return grpcError;
  }

  return null;
}

export default RunnerService;
