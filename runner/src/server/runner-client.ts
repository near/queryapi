import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { type ProtoGrpcType } from '../generated/runner';
import { type RunnerClient } from '../generated/runner/Runner';
// TODO: Replace this client with a Rust client
const PROTO_PATH = 'protos/runner.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const runner = (grpc.loadPackageDefinition(packageDefinition) as unknown) as ProtoGrpcType;
const runnerClient: RunnerClient = new runner.runner.Runner('localhost:7001', grpc.credentials.createInsecure());
export default runnerClient;