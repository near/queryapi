import { startServer as startMetricsServer } from './metrics';
import { startServer as startGrpcServer } from './server';
import logger from './logger';

startGrpcServer();

startMetricsServer().catch((err) => {
  logger.error('Failed to start metrics server', err);
});
