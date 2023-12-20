import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import getRunnerService from './runner-service';
import { type ProtoGrpcType } from '../generated/runner';
import StreamHandler from '../stream-handler/stream-handler';

const PROTO_PATH = 'protos/runner.proto';

export default function startRunnerServer (): grpc.Server {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH);
  const runnerProto = (grpc.loadPackageDefinition(
    packageDefinition
  ) as unknown) as ProtoGrpcType;

  const server = new grpc.Server();
  server.addService(runnerProto.spec.Runner.service, getRunnerService(StreamHandler));
  const credentials = grpc.ServerCredentials;

  server.bindAsync(
    '0.0.0.0:50007', // TODO: Read port from ENV
    credentials.createInsecure(), // TODO: Use secure credentials with allow for Coordinator
    (err: Error | null, port: number) => {
      if (err) {
        console.error(`Server error: ${err.message}`);
      } else {
        console.log(`Server bound on port: ${port}`);
        server.start();
      }
    }
  );
  return server;
}
