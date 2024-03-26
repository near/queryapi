import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { type ProtoGrpcType } from '../generated/runner';
import { type RunnerClient } from '../generated/runner/Runner';

const PROTO_PATH = 'protos/runner.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const runner = (grpc.loadPackageDefinition(packageDefinition) as unknown) as ProtoGrpcType;

const serverPort = process.env.GRPC_SERVER_PORT ?? '7001';

const runnerClient: RunnerClient = new runner.runner.Runner(`localhost:${serverPort}`, grpc.credentials.createInsecure());

export default runnerClient;
