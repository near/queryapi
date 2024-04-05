import pgFormat from 'pg-format';
import IndexerLogger, { IndexerStatus } from './indexer-logger';
import type PgClient from '../pg-client';
import { LogType, LogLevel, type LogEntry } from './indexer-logger';

describe('IndexerLogger', () => {
  let genericMockPgClient: PgClient;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn().mockReturnValue({ rows: [] });
    genericMockPgClient = {
      query,
      format: pgFormat
    } as unknown as PgClient;
  });

  const mockDatabaseConnectionParameters = {
    username: 'test_user',
    password: 'test_password',
    host: 'test_host',
    port: 5432,
    database: 'test_database'
  };
  const functionName = 'some_account/some_indexer';
  const schemaName = functionName.replace(/[^a-zA-Z0-9]/g, '_');

  describe('writeLog', () => {
    it('should insert a single log entry into the database', async () => {
      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntry: LogEntry = {
        blockHeight: 123,
        logTimestamp: new Date(),
        logType: LogType.SYSTEM,
        logLevel: LogLevel.INFO,
        message: 'Test log message'
      };

      await indexerLogger.writeLogs(logEntry);

      const expectedQueryStructure = `INSERT INTO ${schemaName}.__logs (block_height, date, timestamp, type, level, message) VALUES`;
      expect(query.mock.calls[0][0]).toContain(expectedQueryStructure);
    });

    it('should handle errors when inserting a single log entry', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert log'));

      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntry: LogEntry = {
        blockHeight: 123,
        logTimestamp: new Date(),
        logType: LogType.SYSTEM,
        logLevel: LogLevel.INFO,
        message: 'Test log message'
      };

      await expect(indexerLogger.writeLogs(logEntry)).rejects.toThrow('Failed to insert log');
    });

    it('should insert a batch of log entries into the database', async () => {
      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntries: LogEntry[] = [
        {
          blockHeight: 123,
          logTimestamp: new Date(),
          logType: LogType.SYSTEM,
          logLevel: LogLevel.INFO,
          message: 'Test log message 1'
        },
        {
          blockHeight: 124,
          logTimestamp: new Date(),
          logType: LogType.SYSTEM,
          logLevel: LogLevel.INFO,
          message: 'Test log message 2'
        }
      ];

      await indexerLogger.writeLogs(logEntries);

      const expectedQuery = `INSERT INTO ${schemaName}.__logs (block_height, date, timestamp, type, level, message) VALUES`;
      expect(query.mock.calls[0][0]).toContain(expectedQuery);
    });

    it('should handle errors when inserting a batch of log entries', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert batch of logs'));

      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntries: LogEntry[] = [
        {
          blockHeight: 123,
          logTimestamp: new Date(),
          logType: LogType.SYSTEM,
          logLevel: LogLevel.INFO,
          message: 'Test log message 1'
        },
        {
          blockHeight: 124,
          logTimestamp: new Date(),
          logType: LogType.SYSTEM,
          logLevel: LogLevel.INFO,
          message: 'Test log message 2'
        }
      ];

      await expect(indexerLogger.writeLogs(logEntries)).rejects.toThrow('Failed to insert batch of logs');
    });

    it('should handle empty log entry', async () => {
      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntries: LogEntry[] = [];
      await indexerLogger.writeLogs(logEntries);

      expect(query).not.toHaveBeenCalled();
    });

    it('should skip log entries with levels lower than the logging level specified in the constructor', async () => {
      const indexerLogger = new IndexerLogger(functionName, LogLevel.ERROR, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntry: LogEntry = {
        blockHeight: 123,
        logTimestamp: new Date(),
        logType: LogType.SYSTEM,
        logLevel: LogLevel.INFO,
        message: 'Test log message'
      };

      await indexerLogger.writeLogs(logEntry);

      expect(query).not.toHaveBeenCalled();
    });

    it('log status for indexer', async () => {
      const indexerLogger = new IndexerLogger(functionName, 5, mockDatabaseConnectionParameters, genericMockPgClient);
      await indexerLogger.setIndexerStatus(IndexerStatus.RUNNING);
      expect(query.mock.calls[0][0]).toEqual(
        `INSERT INTO ${schemaName}.__metadata (function_name, attribute, value) VALUES ('${schemaName}', 'STATUS', 'RUNNING') ON CONFLICT (function_name, attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *`
      );
    });

    it('log last processed block height for indexer', async () => {
      const indexerLogger = new IndexerLogger(functionName, 5, mockDatabaseConnectionParameters, genericMockPgClient);
      await indexerLogger.updateIndexerBlockheight(123);
      expect(query.mock.calls[0][0]).toEqual(
        `INSERT INTO ${schemaName}.__metadata (function_name, attribute, value) VALUES ('${schemaName}', 'LAST_PROCESSED_BLOCK_HEIGHT', '123') ON CONFLICT (function_name, attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *`
      );
    });
  });
});
