// Original file: protos/runner.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { ListStreamsRequest as _spec_ListStreamsRequest, ListStreamsRequest__Output as _spec_ListStreamsRequest__Output } from '../spec/ListStreamsRequest';
import type { ListStreamsResponse as _spec_ListStreamsResponse, ListStreamsResponse__Output as _spec_ListStreamsResponse__Output } from '../spec/ListStreamsResponse';
import type { StartStreamRequest as _spec_StartStreamRequest, StartStreamRequest__Output as _spec_StartStreamRequest__Output } from '../spec/StartStreamRequest';
import type { StartStreamResponse as _spec_StartStreamResponse, StartStreamResponse__Output as _spec_StartStreamResponse__Output } from '../spec/StartStreamResponse';
import type { StopStreamRequest as _spec_StopStreamRequest, StopStreamRequest__Output as _spec_StopStreamRequest__Output } from '../spec/StopStreamRequest';
import type { StopStreamResponse as _spec_StopStreamResponse, StopStreamResponse__Output as _spec_StopStreamResponse__Output } from '../spec/StopStreamResponse';
import type { UpdateStreamRequest as _spec_UpdateStreamRequest, UpdateStreamRequest__Output as _spec_UpdateStreamRequest__Output } from '../spec/UpdateStreamRequest';
import type { UpdateStreamResponse as _spec_UpdateStreamResponse, UpdateStreamResponse__Output as _spec_UpdateStreamResponse__Output } from '../spec/UpdateStreamResponse';

export interface RunnerClient extends grpc.Client {
  ListStreams(argument: _spec_ListStreamsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  ListStreams(argument: _spec_ListStreamsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  ListStreams(argument: _spec_ListStreamsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  ListStreams(argument: _spec_ListStreamsRequest, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  listStreams(argument: _spec_ListStreamsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  listStreams(argument: _spec_ListStreamsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  listStreams(argument: _spec_ListStreamsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  listStreams(argument: _spec_ListStreamsRequest, callback: grpc.requestCallback<_spec_ListStreamsResponse__Output>): grpc.ClientUnaryCall;
  
  StartStream(argument: _spec_StartStreamRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  StartStream(argument: _spec_StartStreamRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  StartStream(argument: _spec_StartStreamRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  StartStream(argument: _spec_StartStreamRequest, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  startStream(argument: _spec_StartStreamRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  startStream(argument: _spec_StartStreamRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  startStream(argument: _spec_StartStreamRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  startStream(argument: _spec_StartStreamRequest, callback: grpc.requestCallback<_spec_StartStreamResponse__Output>): grpc.ClientUnaryCall;
  
  StopStream(argument: _spec_StopStreamRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  StopStream(argument: _spec_StopStreamRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  StopStream(argument: _spec_StopStreamRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  StopStream(argument: _spec_StopStreamRequest, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  stopStream(argument: _spec_StopStreamRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  stopStream(argument: _spec_StopStreamRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  stopStream(argument: _spec_StopStreamRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  stopStream(argument: _spec_StopStreamRequest, callback: grpc.requestCallback<_spec_StopStreamResponse__Output>): grpc.ClientUnaryCall;
  
  UpdateStream(argument: _spec_UpdateStreamRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  UpdateStream(argument: _spec_UpdateStreamRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  UpdateStream(argument: _spec_UpdateStreamRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  UpdateStream(argument: _spec_UpdateStreamRequest, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  updateStream(argument: _spec_UpdateStreamRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  updateStream(argument: _spec_UpdateStreamRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  updateStream(argument: _spec_UpdateStreamRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  updateStream(argument: _spec_UpdateStreamRequest, callback: grpc.requestCallback<_spec_UpdateStreamResponse__Output>): grpc.ClientUnaryCall;
  
}

export interface RunnerHandlers extends grpc.UntypedServiceImplementation {
  ListStreams: grpc.handleUnaryCall<_spec_ListStreamsRequest__Output, _spec_ListStreamsResponse>;
  
  StartStream: grpc.handleUnaryCall<_spec_StartStreamRequest__Output, _spec_StartStreamResponse>;
  
  StopStream: grpc.handleUnaryCall<_spec_StopStreamRequest__Output, _spec_StopStreamResponse>;
  
  UpdateStream: grpc.handleUnaryCall<_spec_UpdateStreamRequest__Output, _spec_UpdateStreamResponse>;
  
}

export interface RunnerDefinition extends grpc.ServiceDefinition {
  ListStreams: MethodDefinition<_spec_ListStreamsRequest, _spec_ListStreamsResponse, _spec_ListStreamsRequest__Output, _spec_ListStreamsResponse__Output>
  StartStream: MethodDefinition<_spec_StartStreamRequest, _spec_StartStreamResponse, _spec_StartStreamRequest__Output, _spec_StartStreamResponse__Output>
  StopStream: MethodDefinition<_spec_StopStreamRequest, _spec_StopStreamResponse, _spec_StopStreamRequest__Output, _spec_StopStreamResponse__Output>
  UpdateStream: MethodDefinition<_spec_UpdateStreamRequest, _spec_UpdateStreamResponse, _spec_UpdateStreamRequest__Output, _spec_UpdateStreamResponse__Output>
}
