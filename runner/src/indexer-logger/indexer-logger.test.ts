import pgFormat from 'pg-format';
import IndexerLogger from './indexer-logger';
import PgClient from '../pg-client';
import { LogLevel } from '../stream-handler/stream-handler';
import { LogType, type LogEntry } from './indexer-logger';

describe('IndexerLogger', () => {
    let pgClient: PgClient;
    let query: any;

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

  describe('create', () => {
    
    it('should create an instance of IndexerLogger with provided PgClient instance', () => {
      const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
      expect(indexerLogger).toBeInstanceOf(IndexerLogger);
    });

    it('should create an instance of IndexerLogger with a new PgClient instance if none provided', () => {
      const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters);
      expect(indexerLogger).toBeInstanceOf(IndexerLogger);
    });

  });

  describe('writeLog', () => {

    it('should insert a single log entry into the database', async () => {
        const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
        const logEntry = {
            blockHeight: 123,
            logTimestamp: new Date(),
            logType: LogType.SYSTEM,
            logLevel: LogLevel.INFO,
            message: 'Test log message'
        };

        await indexerLogger.writeLog(logEntry);

        expect(query).toHaveBeenCalled(); // Ensure query method is called
    });

    it('should handle errors when inserting a single log entry', async () => {
        // Mocking pgClient.query to throw an error
        query.mockRejectedValueOnce(new Error('Failed to insert log'));
        
        const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
        const logEntry = {
            blockHeight: 123,
            logTimestamp: new Date(),
            logType: LogType.SYSTEM,
            logLevel: LogLevel.INFO,
            message: 'Test log message'
        };

        await expect(indexerLogger.writeLog(logEntry)).rejects.toThrow('Failed to insert log');
    });
});

describe('writeLogBatch', () => {

    it('should insert a batch of log entries into the database', async () => {
        const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
        const logEntries = [
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

        await indexerLogger.writeLogBatch(logEntries);

        expect(query).toHaveBeenCalled(); // Ensure query method is called
    });

    it('should handle errors when inserting a batch of log entries', async () => {
        query.mockRejectedValueOnce(new Error('Failed to insert batch of logs'));
        
        const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
        const logEntries = [
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

        await expect(indexerLogger.writeLogBatch(logEntries)).rejects.toThrow('Failed to insert batch of logs');
    });

    it('should handle empty log entry batch', async () => {
        const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
        const logEntries: LogEntry[] = [];
        await indexerLogger.writeLogBatch(logEntries);
        expect(query).not.toHaveBeenCalled();
    });

  });
});