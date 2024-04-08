import { LogType, LogLevel } from '../indexer-logger/indexer-logger';

export default class LogEntry {
  public readonly timestamp: Date;

  constructor (
    public readonly message: string,
    public readonly level: LogLevel,
    public readonly type: LogType,
    public readonly blockHeight?: number
  ) {
    this.timestamp = new Date();
  }

  static createLog (message: string, level: LogLevel, type: LogType, blockHeight?: number): LogEntry {
    return new LogEntry(message, level, type, blockHeight);
  }

  static systemDebug (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.DEBUG, LogType.SYSTEM, blockHeight);
  }

  static systemInfo (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.INFO, LogType.SYSTEM, blockHeight);
  }

  static systemWarn (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.WARN, LogType.SYSTEM, blockHeight);
  }

  static systemError (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.ERROR, LogType.SYSTEM, blockHeight);
  }

  static userDebug (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.DEBUG, LogType.USER, blockHeight);
  }

  static userInfo (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.INFO, LogType.USER, blockHeight);
  }

  static userWarn (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.WARN, LogType.USER, blockHeight);
  }

  static userError (message: string, blockHeight?: number): LogEntry {
    return LogEntry.createLog(message, LogLevel.ERROR, LogType.USER, blockHeight);
  }
}
