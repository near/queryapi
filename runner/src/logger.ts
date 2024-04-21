import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';

const { format, transports } = winston;

const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
  ),
});

if (process.env.GCP_LOGGING_ENABLED) {
  logger.add(new LoggingWinston({ redirectToStdout: true }));
} else {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
  }));
}

export default logger;
