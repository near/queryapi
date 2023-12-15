import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { RunnerClient as _spec_RunnerClient, RunnerDefinition as _spec_RunnerDefinition } from './spec/Runner';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  spec: {
    ListStreamsRequest: MessageTypeDefinition
    ListStreamsResponse: MessageTypeDefinition
    Runner: SubtypeConstructor<typeof grpc.Client, _spec_RunnerClient> & { service: _spec_RunnerDefinition }
    StartStreamRequest: MessageTypeDefinition
    StartStreamResponse: MessageTypeDefinition
    StopStreamRequest: MessageTypeDefinition
    StopStreamResponse: MessageTypeDefinition
    StreamInfo: MessageTypeDefinition
    UpdateStreamRequest: MessageTypeDefinition
    UpdateStreamResponse: MessageTypeDefinition
  }
}

