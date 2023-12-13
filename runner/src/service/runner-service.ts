import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import { type RunnerHandlers } from '../generated/spec/Runner';
import { type StartStreamResponse } from '../generated/spec/StartStreamResponse';
import { type StartStreamRequest } from '../generated/spec/StartStreamRequest';
import { type StopStreamRequest } from '../generated/spec/StopStreamRequest';
import { type StopStreamResponse } from '../generated/spec/StopStreamResponse';
import { type ListStreamsRequest } from '../generated/spec/ListStreamsRequest';
import { type ListStreamsResponse } from '../generated/spec/ListStreamsResponse';

// import { type IRunner } from '../generated/runner.grpc-server';
// import { type StartStreamRequest, StartStreamResponse, type StopStreamRequest, StopStreamResponse, type ListStreamsRequest, ListStreamsResponse } from '../generated/runner';

const streams = new Set<string>();

const RunnerService: RunnerHandlers = {
  StartStream (call: ServerUnaryCall<StartStreamRequest, StartStreamResponse>, callback: sendUnaryData<StartStreamResponse>): void {
    const newStream = call.request.streamId;
    streams.add((newStream ?? 'default') + Math.random().toString());
    callback(null, { streamId: newStream });
  },

  StopStream (call: ServerUnaryCall<StopStreamRequest, StopStreamResponse>, callback: sendUnaryData<StopStreamResponse>): void {
    // implementation
    const streamToRemove = call.request.streamId;
    streams.delete(streamToRemove ?? 'default');
    callback(null, { status: 'OK', streamId: streamToRemove });
  },

  ListStreams (call: ServerUnaryCall<ListStreamsRequest, ListStreamsResponse>, callback: sendUnaryData<ListStreamsResponse>): void {
    // implementation
    console.log(call);
    callback(null, {
      streams: Array.from(streams).map(stream => {
        return { streamId: stream };
      })
    });
  }
};

export default RunnerService;
