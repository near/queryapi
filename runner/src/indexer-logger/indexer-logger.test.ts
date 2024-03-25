import pgFormat from 'pg-format';
import IndexerLogger from './indexer-logger';
import PgClient from '../pg-client';
import { LogLevel } from '../stream-handler/stream-handler';

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

  describe('create', () => {
    it('should create an instance of IndexerLogger with provided PgClient instance', () => {
      const indexerLogger = IndexerLogger.create(mockDatabaseConnectionParameters, pgClient);
      expect(indexerLogger).toBeInstanceOf(IndexerLogger);
    });

    it('should create an instance of IndexerLogger with a new PgClient instance if none provided', () => {
      const indexerLogger = IndexerLogger.create(mockDatabaseConnectionParameters);
      expect(indexerLogger).toBeInstanceOf(IndexerLogger);
    });
  });

  describe('writeLog', () => {
        it('should call the query method with the correct parameters', async () => {
            
            const spyFormatDate = jest.spyOn(IndexerLogger.prototype, 'formatDate');

            const indexerLogger = IndexerLogger.create(mockDatabaseConnectionParameters, pgClient);
            const blockHeight = 123;
            const functionName = 'testFunction';
            const logDate = new Date();
            const logTimestamp = new Date();
            const logType = 'system';
            const logLevel = LogLevel.INFO;
            const message = 'Test message';

            await indexerLogger.writeLog(
                blockHeight,
                functionName,
                logDate,
                logTimestamp,
                logType,
                logLevel,
                message
            );
            
            expect(typeof blockHeight).toBe('number');
            expect(typeof functionName).toBe('string');
            expect(logDate).toBeInstanceOf(Date);
            expect(logTimestamp).toBeInstanceOf(Date);
            expect(typeof logType).toBe('string');
            expect(typeof logLevel).toBe('number'); 
            expect(typeof message).toBe('string');

            expect(spyFormatDate).toHaveBeenCalledWith(logDate);
            expect(query.mock.calls.length).toBe(1);
            expect(query.mock.calls[0][0]).toEqual('INSERT INTO testFunction.__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES ($1, $2, $3, $4, $5, $6)');
            expect(query.mock.calls[0][1]).toEqual([
                blockHeight,
                expect.any(Date), 
                logTimestamp,
                logType,
                LogLevel[logLevel],
                message
            ]);
        });
    });
});



