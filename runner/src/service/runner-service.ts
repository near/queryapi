import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import { type RunnerHandlers } from '../generated/spec/Runner';
import { type StartStreamResponse } from '../generated/spec/StartStreamResponse';
import { type StartStreamRequest } from '../generated/spec/StartStreamRequest';
import { type UpdateStreamRequest } from '../generated/spec/UpdateStreamRequest';
import { type UpdateStreamResponse } from '../generated/spec/UpdateStreamResponse';
import { type StopStreamRequest } from '../generated/spec/StopStreamRequest';
import { type StopStreamResponse } from '../generated/spec/StopStreamResponse';
import { type ListStreamsResponse } from '../generated/spec/ListStreamsResponse';
import StreamHandler from '../stream-handler';
import * as grpc from '@grpc/grpc-js';

type StreamHandlers = Record<string, StreamHandler>;
const streamHandlers: StreamHandlers = {};

const RunnerService: RunnerHandlers = {
  StartStream (call: ServerUnaryCall<StartStreamRequest, StartStreamResponse>, callback: sendUnaryData<StartStreamResponse>): void {
    console.log('StartStream called');
    // Validate request
    const validationResult = validateStartStreamRequest(call.request);
    if (validationResult !== null) {
      callback(validationResult, null);
      return;
    }

    // Handle request
    try {
      if (call.request.streamId === undefined || call.request.redisStream === undefined) {
        throw new Error('Validation failed to catch invalid start request');
      }
      const streamHandler = new StreamHandler(call.request.redisStream); // TODO: Supply validated IndexerConfig
      streamHandlers[call.request.streamId] = streamHandler;
      callback(null, { streamId: call.request.streamId });
    } catch (error) {
      callback(handleInternalError(error), null);
    }
  },

  UpdateStream (call: ServerUnaryCall<UpdateStreamRequest, UpdateStreamResponse>, callback: sendUnaryData<UpdateStreamResponse>): void {
    console.log('UpdateStream called');
    // Validate request
    const validationResult = validateUpdateStreamRequest(call.request);
    if (validationResult !== null) {
      callback(validationResult, null);
      return;
    }

    // Handle request
    try {
      if (call.request.streamId === undefined || call.request.indexerConfig === undefined) {
        throw new Error('Validation failed to catch invalid update request');
      }
      const config = JSON.parse(call.request.indexerConfig);
      streamHandlers[call.request.streamId].updateIndexerConfig({
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
    console.log('StopStream called');
    // Validate request
    const validationResult = validateStopStreamRequest(call.request);
    if (validationResult !== null) {
      callback(validationResult, null);
      return;
    }

    // Handle request
    if (call.request.streamId === undefined) {
      throw new Error('Validation failed to catch invalid stop request');
    }
    streamHandlers[call.request.streamId]?.stop()
      .then(() => {
        callback(null, { streamId: call.request.streamId });
      }).catch(error => {
        const grpcError = handleInternalError(error);
        callback(grpcError, null);
      });
  },

  ListStreams (_, callback: sendUnaryData<ListStreamsResponse>): void {
    console.log('ListStreams called');
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

function validateStartStreamRequest (request: StartStreamRequest): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };
  // Validate streamId
  if (request.streamId === undefined || request.streamId.trim() === '') {
    grpcError.message = 'Invalid streamId. It must be a non-empty string.';
    return grpcError;
  }
  if (streamHandlers[request.streamId] !== undefined) {
    grpcError.message = `Stream ${request.streamId as string} can't be started as it already exists`;
    return grpcError;
  }

  // Validate redisStream
  if (request.redisStream === undefined || request.redisStream.trim() === '') {
    grpcError.message = 'Invalid redisStream. It must be a non-empty string.';
    return grpcError;
  }

  // Validate indexerConfig

  return null;
}

function validateUpdateStreamRequest (request: StartStreamRequest): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };
  // Validate streamId
  if (request.streamId === undefined || request.streamId.trim() === '') {
    grpcError.message = 'Invalid streamId. It must be a non-empty string.';
    return grpcError;
  }
  if (streamHandlers[request.streamId] === undefined) {
    grpcError.message = `Stream ${request.streamId as string} cannot be updated as it does not exist`;
    return grpcError;
  }

  // Validate indexerConfig

  return null;
}

function validateStopStreamRequest (request: StartStreamRequest): any | null {
  const grpcError = {
    code: grpc.status.INVALID_ARGUMENT,
    message: ''
  };
  // Validate streamId
  if (request.streamId === undefined || request.streamId.trim() === '') {
    grpcError.message = 'Invalid streamId. It must be a non-empty string.';
    return grpcError;
  }
  if (streamHandlers[request.streamId] === undefined) {
    grpcError.message = `Stream ${request.streamId as string} cannot be stopped as it does not exist`;
    return grpcError;
  }

  return null;
}

export default RunnerService;
