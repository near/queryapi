import pgFormat from 'pg-format';
import IndexerLogger from './indexer-logger';
import PgClient from '../pg-client';
import { LogLevel } from '../stream-handler/stream-handler';
import { LogType, type LogEntry } from './indexer-logger';

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
            const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
            const logEntry: LogEntry = {
                blockHeight: 123,
                logTimestamp: new Date(),
                logType: LogType.SYSTEM,
                logLevel: LogLevel.INFO,
                message: 'Test log message'
            };
        
            await indexerLogger.writeLog(logEntry);
        
            const expectedQueryStructure = `INSERT INTO "${functionName}".__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES`;
            expect(query.mock.calls[0][0]).toContain(expectedQueryStructure);
        });

        it('should handle errors when inserting a single log entry', async () => {
            query.mockRejectedValueOnce(new Error('Failed to insert log'));

            const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
            const logEntry: LogEntry = {
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
        
            await indexerLogger.writeLogBatch(logEntries);
        
            const expectedQuery = `INSERT INTO "${functionName}".__logs (block_height, log_date, log_timestamp, log_type, log_level, message) VALUES`;
            expect(query.mock.calls[0][0]).toContain(expectedQuery);
        });

        it('should handle errors when inserting a batch of log entries', async () => {
            query.mockRejectedValueOnce(new Error('Failed to insert batch of logs'));

            const indexerLogger = new IndexerLogger(functionName, mockDatabaseConnectionParameters, pgClient);
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
