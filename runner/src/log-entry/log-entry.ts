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

  static systemInfo (message: string, blockHeight?: number): LogEntry {
    return new LogEntry(message, LogLevel.INFO, LogType.SYSTEM, blockHeight);
  }

  static userLogs (message: string, level: LogLevel, blockHeight?: number): LogEntry {
    return new LogEntry(message, level, LogType.USER, blockHeight);
  }
}
