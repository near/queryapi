import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import { type RunnerHandlers } from '../generated/spec/Runner';
import { type StartStreamResponse } from '../generated/spec/StartStreamResponse';
import { type StartStreamRequest } from '../generated/spec/StartStreamRequest';
import { type StopStreamRequest } from '../generated/spec/StopStreamRequest';
import { type StopStreamResponse } from '../generated/spec/StopStreamResponse';
// import { type ListStreamsRequest } from '../generated/spec/ListStreamsRequest';
import { type ListStreamsResponse } from '../generated/spec/ListStreamsResponse';
import StreamHandler from '../stream-handler';
import * as grpc from '@grpc/grpc-js';

type StreamHandlers = Record<string, StreamHandler>;
const streamHandlers: StreamHandlers = {};

const RunnerService: RunnerHandlers = {
  StartStream (call: ServerUnaryCall<StartStreamRequest, StartStreamResponse>, callback: sendUnaryData<StartStreamResponse>): void {
    console.log('StartStream called', call.request);
    console.log(call.request);
    // Validate request
    const validationResult = validateStartStreamRequest(call.request);
    if (validationResult !== null) {
      callback(validationResult, null);
      return;
    }

    // Handle request
    try {
      if (call.request.streamId === undefined || call.request.redisStream === undefined) {
        throw new Error('Validation failed to catch invalid request');
      }
      const streamHandler = new StreamHandler(call.request.redisStream ?? '');
      streamHandlers[call.request.streamId ?? ''] = streamHandler;
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

    streamHandlers[call.request.streamId ?? '']?.stop().catch(error => {
      const grpcError = handleInternalError(error);
      callback(grpcError, null);
    });
    callback(null, { status: 'OK', streamId: call.request.streamId });
  },

  ListStreams (_, callback: sendUnaryData<ListStreamsResponse>): void {
    console.log('ListStreams called');
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
    grpcError.message = `Stream ${request.streamId} can't be started as it already exists`;
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
    grpcError.message = `Stream ${request.streamId} cannot be stopped as it doesn't exist`;
    return grpcError;
  }

  return null;
}

export default RunnerService;
