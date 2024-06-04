"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogType = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 2] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 5] = "INFO";
    LogLevel[LogLevel["WARN"] = 6] = "WARN";
    LogLevel[LogLevel["ERROR"] = 8] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
var LogType;
(function (LogType) {
    LogType["SYSTEM"] = "system";
    LogType["USER"] = "user";
})(LogType || (exports.LogType = LogType = {}));
class LogEntry {
    constructor(message, level, type, blockHeight) {
        this.message = message;
        this.level = level;
        this.type = type;
        this.blockHeight = blockHeight;
        this.timestamp = new Date();
    }
    static createLog(message, level, type, blockHeight) {
        return new LogEntry(message, level, type, blockHeight);
    }
    static systemDebug(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.DEBUG, LogType.SYSTEM, blockHeight);
    }
    static systemInfo(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.INFO, LogType.SYSTEM, blockHeight);
    }
    static systemWarn(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.WARN, LogType.SYSTEM, blockHeight);
    }
    static systemError(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.ERROR, LogType.SYSTEM, blockHeight);
    }
    static userDebug(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.DEBUG, LogType.USER, blockHeight);
    }
    static userInfo(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.INFO, LogType.USER, blockHeight);
    }
    static userWarn(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.WARN, LogType.USER, blockHeight);
    }
    static userError(message, blockHeight) {
        return LogEntry.createLog(message, LogLevel.ERROR, LogType.USER, blockHeight);
    }
}
exports.default = LogEntry;
