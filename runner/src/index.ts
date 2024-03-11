import { startServer as startMetricsServer } from './metrics';
import startRunnerServer from './server/runner-server';
import type StreamHandler from './stream-handler';

const executors = new Map<string, StreamHandler>();
startRunnerServer(executors);

startMetricsServer().catch((err) => {
  console.error('Failed to start metrics server', err);
});
