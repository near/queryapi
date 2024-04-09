import pgFormat from 'pg-format';
import IndexerLogger from './indexer-logger';
import type PgClient from '../pg-client';
import LogEntry, { LogLevel } from './log-entry';

describe('IndexerLogger', () => {
  let pgClient: PgClient;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn().mockReturnValue({ rows: [] });
    pgClient = {
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
  const functionName = 'testFunction';

  describe('writeLog', () => {
    it('should insert a single log entry into the database', async () => {
      const date = new Date();
      jest.useFakeTimers({ now: date.getTime() });
      const formattedDate = date.toISOString().replace('T', ' ').replace('Z', '+00');

      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, pgClient);
      const infoEntry = LogEntry.systemInfo('Info message');
      await indexerLogger.writeLogs([infoEntry]);

      const expectedQueryStructure = `INSERT INTO "${functionName}".__logs (block_height, date, timestamp, type, level, message) VALUES (NULL, '${formattedDate}', '${formattedDate}', 'system', 'INFO', 'Info message')`;
      expect(query.mock.calls[0][0]).toEqual(expectedQueryStructure);
    });

    it('should insert a single log entry into the database when logEntry has a blockheight', async () => {
      const date = new Date();
      jest.useFakeTimers({ now: date.getTime() });
      const formattedDate = date.toISOString().replace('T', ' ').replace('Z', '+00');

      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, pgClient);
      const errorEntry = LogEntry.systemError('Error message', 12345);
      await indexerLogger.writeLogs([errorEntry]);

      const expectedQueryStructure = `INSERT INTO "${functionName}".__logs (block_height, date, timestamp, type, level, message) VALUES ('12345', '${formattedDate}', '${formattedDate}', 'system', 'ERROR', 'Error message')`;
      expect(query.mock.calls[0][0]).toEqual(expectedQueryStructure);
    });

    it('should handle errors when inserting a single log entry', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert log'));

      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, pgClient);
      const infoEntry = LogEntry.systemInfo('Information message');

      await expect(indexerLogger.writeLogs([infoEntry])).rejects.toThrow('Failed to insert log');
    });

    it('should insert a batch of log entries into the database', async () => {
      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, pgClient);
      const debugEntry = LogEntry.systemDebug('Debug message');
      const infoEntry = LogEntry.systemInfo('Information message');
      const logEntries: LogEntry[] = [
        debugEntry,
        infoEntry
      ];

      await indexerLogger.writeLogs(logEntries);

      const expectedQuery = `INSERT INTO "${functionName}".__logs (block_height, date, timestamp, type, level, message) VALUES`;
      expect(query.mock.calls[0][0]).toContain(expectedQuery);
    });

    it('should handle errors when inserting a batch of log entries', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert batch of logs'));

      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, pgClient);
      const debugEntry = LogEntry.systemDebug('Debug message');
      const infoEntry = LogEntry.systemInfo('Information message');
      const logEntries: LogEntry[] = [
        debugEntry,
        infoEntry
      ];

      await expect(indexerLogger.writeLogs(logEntries)).rejects.toThrow('Failed to insert batch of logs');
    });

    it('should handle empty log entry', async () => {
      const indexerLogger = new IndexerLogger(functionName, LogLevel.INFO, mockDatabaseConnectionParameters, pgClient);
      const logEntries: LogEntry[] = [];
      await indexerLogger.writeLogs(logEntries);

      expect(query).not.toHaveBeenCalled();
    });

    it('should skip log entries with levels lower than the logging level specified in the constructor', async () => {
      const indexerLogger = new IndexerLogger(functionName, LogLevel.ERROR, mockDatabaseConnectionParameters, pgClient);
      const debugEntry = LogEntry.systemDebug('Debug message');

      await indexerLogger.writeLogs([debugEntry]);

      expect(query).not.toHaveBeenCalled();
    });
  });
});
