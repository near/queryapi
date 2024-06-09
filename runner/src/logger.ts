import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';
import Transport from 'winston-transport';

import { METRICS } from './metrics';

const { format, transports } = winston;

class LogCounter extends Transport {
  log (info: { level: string }, callback: () => void): void {
    METRICS.LOGS_COUNT.labels({ level: info.level }).inc();

    callback();
  }
}

const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
  ),
  transports: [new LogCounter()],
});

if (process.env.GCP_LOGGING_ENABLED) {
  logger.add(new LoggingWinston({ redirectToStdout: true }));
} else {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
    silent: process.env.NODE_ENV === 'test'
  }));
}

export default logger;
