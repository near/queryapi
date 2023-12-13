import { type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js';
import { type IRunner } from '../generated/runner.grpc-server';
import { type StartStreamRequest, StartStreamResponse, type StopStreamRequest, StopStreamResponse, type ListStreamsRequest, ListStreamsResponse } from '../generated/runner';

const streams = new Set<string>();

const RunnerService: IRunner = {
  startStream (call: ServerUnaryCall<StartStreamRequest, StartStreamResponse>, callback: sendUnaryData<StartStreamResponse>): void {
    const newStream = call.request.streamId;
    streams.add(newStream);
    callback(null, StartStreamResponse.create({ streamId: newStream }));
  },

  stopStream (call: ServerUnaryCall<StopStreamRequest, StopStreamResponse>, callback: sendUnaryData<StopStreamResponse>): void {
    // implementation
    const streamToRemove = call.request.streamId;
    streams.delete(streamToRemove);
    callback(null, StopStreamResponse.create({ status: 'OK', streamId: streamToRemove }));
  },

  listStreams (call: ServerUnaryCall<ListStreamsRequest, ListStreamsResponse>, callback: sendUnaryData<ListStreamsResponse>): void {
    // implementation
    console.log(call);
    callback(null, ListStreamsResponse.create({
      streams: Array.from(streams).map(stream => {
        return { streamId: stream };
      })
    }));
  }
};

export default RunnerService;
