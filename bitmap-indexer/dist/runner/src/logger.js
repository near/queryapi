"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const logging_winston_1 = require("@google-cloud/logging-winston");
const winston_transport_1 = __importDefault(require("winston-transport"));
const metrics_1 = require("./metrics");
const { format, transports } = winston_1.default;
class LogCounter extends winston_transport_1.default {
    log(info, callback) {
        metrics_1.METRICS.LOGS_COUNT.labels({ level: info.level }).inc();
        callback();
    }
}
const logger = winston_1.default.createLogger({
    level: 'info',
    format: format.combine(format.timestamp(), format.errors({ stack: true })),
    transports: [new LogCounter()],
});
if (process.env.GCP_LOGGING_ENABLED) {
    logger.add(new logging_winston_1.LoggingWinston({ redirectToStdout: true }));
}
else {
    logger.add(new transports.Console({
        format: format.combine(format.colorize(), format.simple()),
    }));
}
exports.default = logger;
