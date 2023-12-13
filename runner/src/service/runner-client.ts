import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ProtoGrpcType } from '../generated/runner';
import { RunnerClient } from '../generated/spec/Runner';

const PROTO_PATH = 'protos/runner.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const runner = (grpc.loadPackageDefinition(
    packageDefinition
  ) as unknown) as ProtoGrpcType;
const RunnerClient: RunnerClient = new runner.spec.Runner('localhost:50007', grpc.credentials.createInsecure());

export default RunnerClient;
