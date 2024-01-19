import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { type ProtoGrpcType } from './generated/runner';
import { type RunnerClient } from './generated/runner/Runner';

// TODO: Remove this client when coordinator can make calls

const PROTO_PATH = 'protos/runner.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const runner = (grpc.loadPackageDefinition(packageDefinition) as unknown) as ProtoGrpcType;
const serverIp = (process.env.RUNNER_HOST ?? 'undefined') + ':' + (process.env.RUNNER_PORT ?? 'undefined');
const runnerClient: RunnerClient = new runner.runner.Runner(serverIp, grpc.credentials.createInsecure());
export default runnerClient;
