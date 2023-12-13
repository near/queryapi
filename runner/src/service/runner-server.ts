import * as grpc from '@grpc/grpc-js';
import RunnerService from './runner-service';
import { runnerDefinition } from '../generated/runner.grpc-server';

export default function startServer (): grpc.Server {
  const server = new grpc.Server();
  server.addService(runnerDefinition, RunnerService);
  const credentials = grpc.ServerCredentials;
  server.bindAsync(
    '0.0.0.0:50007', // TODO: Read port from ENV
    credentials.createInsecure(),
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
