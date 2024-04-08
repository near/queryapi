import pgFormat from 'pg-format';
import IndexerMeta, { IndexerStatus } from './indexer-meta';
import type PgClient from '../pg-client';
import { LogType, LogLevel, type LogEntry } from './indexer-meta';

describe('IndexerMeta', () => {
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
      const indexerMeta = new IndexerMeta(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntry: LogEntry = {
        blockHeight: 123,
        logTimestamp: new Date(),
        logType: LogType.SYSTEM,
        logLevel: LogLevel.INFO,
        message: 'Test log message'
      };

      await indexerMeta.writeLogs(logEntry);

      const expectedQueryStructure = `INSERT INTO ${schemaName}.__logs (block_height, date, timestamp, type, level, message) VALUES`;
      expect(query.mock.calls[0][0]).toContain(expectedQueryStructure);
    });

    it('should handle errors when inserting a single log entry', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert log'));

      const indexerMeta = new IndexerMeta(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntry: LogEntry = {
        blockHeight: 123,
        logTimestamp: new Date(),
        logType: LogType.SYSTEM,
        logLevel: LogLevel.INFO,
        message: 'Test log message'
      };

      await expect(indexerMeta.writeLogs(logEntry)).rejects.toThrow('Failed to insert log');
    });

    it('should insert a batch of log entries into the database', async () => {
      const indexerMeta = new IndexerMeta(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
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

      await indexerMeta.writeLogs(logEntries);

      const expectedQuery = `INSERT INTO ${schemaName}.__logs (block_height, date, timestamp, type, level, message) VALUES`;
      expect(query.mock.calls[0][0]).toContain(expectedQuery);
    });

    it('should handle errors when inserting a batch of log entries', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert batch of logs'));

      const indexerMeta = new IndexerMeta(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
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

      await expect(indexerMeta.writeLogs(logEntries)).rejects.toThrow('Failed to insert batch of logs');
    });

    it('should handle empty log entry', async () => {
      const indexerMeta = new IndexerMeta(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntries: LogEntry[] = [];
      await indexerMeta.writeLogs(logEntries);

      expect(query).not.toHaveBeenCalled();
    });

    it('should skip log entries with levels lower than the logging level specified in the constructor', async () => {
      const indexerMeta = new IndexerMeta(functionName, LogLevel.ERROR, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntry: LogEntry = {
        blockHeight: 123,
        logTimestamp: new Date(),
        logType: LogType.SYSTEM,
        logLevel: LogLevel.INFO,
        message: 'Test log message'
      };

      await indexerMeta.writeLogs(logEntry);

      expect(query).not.toHaveBeenCalled();
    });

    it('writes status for indexer', async () => {
      const indexerMeta = new IndexerMeta(functionName, 5, mockDatabaseConnectionParameters, genericMockPgClient);
      await indexerMeta.setStatus(IndexerStatus.RUNNING);
      expect(query.mock).toBeCalledWith(
        `INSERT INTO ${schemaName}.__metadata (instance, attribute, value) VALUES ('0', 'STATUS', 'RUNNING') ON CONFLICT (instance, attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *`
      );
    });

    it('writes last processed block height for indexer', async () => {
      const indexerMeta = new IndexerMeta(functionName, 5, mockDatabaseConnectionParameters, genericMockPgClient);
      await indexerMeta.updateBlockheight(123);
      expect(query.mock).toBeCalledWith(
        `INSERT INTO ${schemaName}.__metadata (instance, attribute, value) VALUES ('0', 'LAST_PROCESSED_BLOCK_HEIGHT', '123') ON CONFLICT (instance, attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *`
      );
    });
  });
});
