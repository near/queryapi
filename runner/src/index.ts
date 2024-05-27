import { startServer as startMetricsServer } from './metrics';
import { startServer as startGrpcServer } from './server';
import type StreamHandler from './stream-handler';
import logger from './logger';

const executors = new Map<string, StreamHandler>();
startGrpcServer(executors);

startMetricsServer().catch((err) => {
  logger.error('Failed to start metrics server', err);
});
