import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import assert from 'assert';

import logger from '../logger';
import { getRunnerService } from './services/runner';
import { type ProtoGrpcType } from '../generated/runner';
import type StreamHandler from '../stream-handler/stream-handler';

const PROTO_PATH = 'protos/runner.proto';

export function startServer (executors: Map<string, StreamHandler>): grpc.Server {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH);
  const runnerProto = (grpc.loadPackageDefinition(
    packageDefinition
  ) as unknown) as ProtoGrpcType;

  const server = new grpc.Server();
  server.addService(runnerProto.runner.Runner.service, getRunnerService(executors));
  const credentials = grpc.ServerCredentials;

  assert(process.env.GRPC_SERVER_PORT, 'GRPC_SERVER_PORT is not defined');

  server.bindAsync(
    `0.0.0.0:${process.env.GRPC_SERVER_PORT}`,
    credentials.createInsecure(), // TODO: Use secure credentials with allow for Coordinator
    (err: Error | null, port: number) => {
      if (err) {
        logger.error('gRPC server error', err);
      } else {
        logger.info(`gRPC server bound on: 0.0.0.0:${port}`);
        server.start();
      }
    }
  );
  return server;
}
