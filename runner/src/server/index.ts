import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import assert from 'assert';

import logger from '../logger';
import { getRunnerService } from './services/runner';
import { createDataLayerService } from './services/data-layer';
import { type ProtoGrpcType as RunnerProtoGrpcType } from '../generated/runner';
import { type ProtoGrpcType as DataLayerProtoGrpcType } from '../generated/data-layer';
import type StreamHandler from '../stream-handler/stream-handler';

const executors = new Map<string, StreamHandler>();

export function startServer (): grpc.Server {
  const server = new grpc.Server();

  const runnerProto = (grpc.loadPackageDefinition(
    protoLoader.loadSync('protos/runner.proto')
  ) as unknown) as RunnerProtoGrpcType;
  server.addService(runnerProto.runner.Runner.service, getRunnerService(executors));

  const dataLayerProto = (grpc.loadPackageDefinition(
    protoLoader.loadSync('protos/data-layer.proto')
  ) as unknown) as DataLayerProtoGrpcType;
  server.addService(dataLayerProto.data_layer.DataLayer.service, createDataLayerService());

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
      }
    }
  );

  return server;
}
