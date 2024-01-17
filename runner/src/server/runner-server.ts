import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import getRunnerService from './runner-service';
import { type ProtoGrpcType } from '../generated/runner';
import type StreamHandler from '../stream-handler/stream-handler';
import assert from 'assert';

const PROTO_PATH = 'protos/runner.proto';

export default function startRunnerServer (executors: Map<string, StreamHandler>): grpc.Server {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH);
  const runnerProto = (grpc.loadPackageDefinition(
    packageDefinition
  ) as unknown) as ProtoGrpcType;

  const server = new grpc.Server();
  server.addService(runnerProto.runner.Runner.service, getRunnerService(executors));
  const credentials = grpc.ServerCredentials;

  assert(process.env.RUNNER_HOST, 'RUNNER_HOST is not defined');
  assert(process.env.RUNNER_PORT, 'RUNNER_PORT is not defined');

  server.bindAsync(
    `${process.env.RUNNER_HOST}:${process.env.RUNNER_PORT}`,
    credentials.createInsecure(), // TODO: Use secure credentials with allow for Coordinator
    (err: Error | null, port: number) => {
      if (err) {
        console.error(`Server error: ${err.message}`);
      } else {
        console.log(`gRPC server bound on port: ${port}`);
        server.start();
      }
    }
  );
  return server;
}
