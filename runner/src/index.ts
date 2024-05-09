import { startServer as startMetricsServer } from './metrics';
import startRunnerServer from './server/runner-server';
import type StreamHandler from './stream-handler';
import logger from './logger';

const executors = new Map<string, StreamHandler>();
startRunnerServer(executors);

// startMetricsServer().catch((err) => {
//   logger.error('Failed to start metrics server', err);
// });
