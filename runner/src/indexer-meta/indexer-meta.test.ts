import pgFormat from 'pg-format';
import IndexerMeta, { IndexerStatus } from './indexer-meta';
import type PgClient from '../pg-client';
import LogEntry, { LogLevel } from './log-entry';
import { type PostgresConnectionParams } from '../pg-client';
import IndexerConfig from '../indexer-config/indexer-config';

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

  const mockDatabaseConnectionParameters: PostgresConnectionParams = {
    user: 'test_user',
    password: 'test_password',
    host: 'test_host',
    port: 5432,
    database: 'test_database'
  };

  const indexerConfig = new IndexerConfig('', '', 'some_account/some_indexer', 0, '', '', LogLevel.INFO);
  const schemaName = indexerConfig.schemaName();

  describe('writeLog', () => {
    it('should insert a single log entry into the database', async () => {
      const date = new Date();
      jest.useFakeTimers({ now: date.getTime() });
      const formattedDate = date.toISOString().replace('T', ' ').replace('Z', '+00');

      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      const infoEntry = LogEntry.systemInfo('Info message');
      await indexerMeta.writeLogs([infoEntry]);

      const expectedQueryStructure = `INSERT INTO ${schemaName}.__logs (block_height, date, timestamp, type, level, message) VALUES (NULL, '${formattedDate}', '${formattedDate}', 'system', 'INFO', 'Info message')`;
      expect(query.mock.calls[0][0]).toEqual(expectedQueryStructure);
    });

    it('should insert a single log entry into the database when logEntry has a blockheight', async () => {
      const date = new Date();
      jest.useFakeTimers({ now: date.getTime() });
      const formattedDate = date.toISOString().replace('T', ' ').replace('Z', '+00');

      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      const errorEntry = LogEntry.systemError('Error message', 12345);
      await indexerMeta.writeLogs([errorEntry]);

      const expectedQueryStructure = `INSERT INTO ${schemaName}.__logs (block_height, date, timestamp, type, level, message) VALUES ('12345', '${formattedDate}', '${formattedDate}', 'system', 'ERROR', 'Error message')`;
      expect(query.mock.calls[0][0]).toEqual(expectedQueryStructure);
    });

    it('should handle errors when inserting a single log entry', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert log'));

      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      const errorEntry = LogEntry.systemError('Error message', 12345);
      await expect(indexerMeta.writeLogs([errorEntry])).rejects.toThrow('Failed to insert log');
    });

    it('should insert a batch of log entries into the database', async () => {
      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      const debugEntry = LogEntry.systemDebug('Debug message');
      const infoEntry = LogEntry.systemInfo('Information message');
      const logEntries: LogEntry[] = [
        debugEntry,
        infoEntry
      ];

      await indexerMeta.writeLogs(logEntries);

      const expectedQuery = `INSERT INTO ${schemaName}.__logs (block_height, date, timestamp, type, level, message) VALUES`;
      expect(query.mock.calls[0][0]).toContain(expectedQuery);
    });

    it('should handle errors when inserting a batch of log entries', async () => {
      query.mockRejectedValueOnce(new Error('Failed to insert batch of logs'));

      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      const debugEntry = LogEntry.systemDebug('Debug message');
      const infoEntry = LogEntry.systemInfo('Information message');
      const logEntries: LogEntry[] = [
        debugEntry,
        infoEntry
      ];

      await expect(indexerMeta.writeLogs(logEntries)).rejects.toThrow('Failed to insert batch of logs');
    });

    it('should handle empty log entry', async () => {
      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      const logEntries: LogEntry[] = [];
      await indexerMeta.writeLogs(logEntries);

      expect(query).not.toHaveBeenCalled();
    });

    it('should skip log entries with levels lower than the logging level specified in the constructor', async () => {
      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      const debugEntry = LogEntry.systemDebug('Debug message');

      await indexerMeta.writeLogs([debugEntry]);

      expect(query).not.toHaveBeenCalled();
    });

    it('writes status for indexer', async () => {
      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      await indexerMeta.setStatus(IndexerStatus.RUNNING);
      expect(query).toBeCalledWith(
        `INSERT INTO ${schemaName}.__metadata (attribute, value) VALUES ('STATUS', 'RUNNING') ON CONFLICT (attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *`
      );
    });

    it('writes last processed block height for indexer', async () => {
      const indexerMeta = new IndexerMeta(indexerConfig, mockDatabaseConnectionParameters, genericMockPgClient);
      await indexerMeta.updateBlockheight(123);
      expect(query).toBeCalledWith(
        `INSERT INTO ${schemaName}.__metadata (attribute, value) VALUES ('LAST_PROCESSED_BLOCK_HEIGHT', '123') ON CONFLICT (attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *`
      );
    });
  });
});
