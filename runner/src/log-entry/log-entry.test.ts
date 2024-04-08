import LogEntry from './log-entry';
import { LogType, LogLevel } from '../indexer-logger/indexer-logger';

describe('LogEntry', () => {
  test('create a system debug log entry', () => {
    const blockHeight = 100;
    const logEntry = LogEntry.systemDebug('Debug message', blockHeight);
    expect(logEntry.message).toBe('Debug message');
    expect(logEntry.level).toBe(LogLevel.DEBUG);
    expect(logEntry.type).toBe(LogType.SYSTEM);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.blockHeight).toBe(blockHeight);
  });

  test('create a system info log entry', () => {
    const blockHeight = 100;
    const logEntry = LogEntry.systemInfo('Info message', blockHeight);
    expect(logEntry.message).toBe('Info message');
    expect(logEntry.level).toBe(LogLevel.INFO);
    expect(logEntry.type).toBe(LogType.SYSTEM);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.blockHeight).toBe(blockHeight);
  });

  test('create a system warn log entry', () => {
    const blockHeight = 100;
    const logEntry = LogEntry.systemWarn('Warn message', blockHeight);
    expect(logEntry.message).toBe('Warn message');
    expect(logEntry.level).toBe(LogLevel.WARN);
    expect(logEntry.type).toBe(LogType.SYSTEM);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.blockHeight).toBe(blockHeight);
  });

  test('create a system error log entry', () => {
    const blockHeight = 100;
    const logEntry = LogEntry.systemError('Error message', blockHeight);
    expect(logEntry.message).toBe('Error message');
    expect(logEntry.level).toBe(LogLevel.ERROR);
    expect(logEntry.type).toBe(LogType.SYSTEM);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.blockHeight).toBe(blockHeight);
  });

  test('create a user info log entry', () => {
    const blockHeight = 100;
    const logEntry = LogEntry.userInfo('User info message', blockHeight);
    expect(logEntry.message).toBe('User info message');
    expect(logEntry.level).toBe(LogLevel.INFO);
    expect(logEntry.type).toBe(LogType.USER);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.blockHeight).toBe(blockHeight);
  });

  test('create a user warn log entry', () => {
    const blockHeight = 100;
    const logEntry = LogEntry.userWarn('User warn message', blockHeight);
    expect(logEntry.message).toBe('User warn message');
    expect(logEntry.level).toBe(LogLevel.WARN);
    expect(logEntry.type).toBe(LogType.USER);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.blockHeight).toBe(blockHeight);
  });

  test('create a user error log entry', () => {
    const blockHeight = 100;
    const logEntry = LogEntry.userError('User error message', blockHeight);
    expect(logEntry.message).toBe('User error message');
    expect(logEntry.level).toBe(LogLevel.ERROR);
    expect(logEntry.type).toBe(LogType.USER);
    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.blockHeight).toBe(blockHeight);
  });
});
