import LogEntry from './log-entry';
import { LogType, LogLevel } from '../indexer-logger/indexer-logger';

describe('LogEntry', () => {
  test('should create a LogEntry instance with current timestamp', () => {
    const currentTime = new Date();
    const logEntry = new LogEntry('Test message', LogLevel.INFO, LogType.SYSTEM);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    const timestampDifference = Math.abs(currentTime.getTime() - logEntry.timestamp.getTime());
    expect(timestampDifference).toBeLessThanOrEqual(1000);
  });

  test('should create a LogEntry instance with block height', () => {
    const logEntry = new LogEntry('Test message', LogLevel.INFO, LogType.SYSTEM, 12345);
    expect(logEntry.blockHeight).toBe(12345);
  });

  test('systemInfo static method should create a LogEntry instance with predefined parameters', () => {
    const systemLogEntry = LogEntry.systemInfo('System info message', 67890);
    expect(systemLogEntry.type).toBe(LogType.SYSTEM);
  });

  test('userInfo static method should create a LogEntry instance with predefined parameters', () => {
    const systemLogEntry = LogEntry.userLogs('successful run of indexer', LogLevel.INFO, 67890);
    expect(systemLogEntry.type).toBe(LogType.USER);
  });
});
