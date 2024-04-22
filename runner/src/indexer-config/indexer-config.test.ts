import { LogLevel } from '../indexer-meta/log-entry';
import IndexerConfig from './indexer-config';

describe('IndexerConfig unit tests', () => {
  const REDIS_STREAM = 'test:stream';
  const ACCOUNT_ID = 'test-account.near';
  const FUNCTION_NAME = 'test-indexer';
  const SCHEMA = '';

  test('constructor sets executorId correctly', () => {
    const indexerConfig = new IndexerConfig(REDIS_STREAM, ACCOUNT_ID, FUNCTION_NAME, 0, '', SCHEMA, LogLevel.INFO);

    expect(indexerConfig.executorId).toEqual('d43da7e3e466961f28ddaa99c8f7c2b44f25ef8d44931c677e48a6fd051bb966');
  });

  test('exposes full indexer name correctly', () => {
    const indexerConfig = new IndexerConfig(REDIS_STREAM, ACCOUNT_ID, FUNCTION_NAME, 0, '', SCHEMA, LogLevel.INFO);

    expect(indexerConfig.fullName()).toEqual('test-account.near/test-indexer');
  });

  test('returns correct hasura values', () => {
    const indexerConfig = new IndexerConfig(REDIS_STREAM, ACCOUNT_ID, FUNCTION_NAME, 0, '', SCHEMA, LogLevel.INFO);

    expect(indexerConfig.hasuraRoleName()).toEqual('test_account_near');
    expect(indexerConfig.hasuraFunctionName()).toEqual('test_indexer');
  });

  test('returns correct hasura values for account starting with number', () => {
    const indexerConfig = new IndexerConfig(REDIS_STREAM, '0xSome-Account', FUNCTION_NAME, 0, '', SCHEMA, LogLevel.INFO);

    expect(indexerConfig.hasuraRoleName()).toEqual('_0xSome_Account');
    expect(indexerConfig.hasuraFunctionName()).toEqual('test_indexer');
  });

  test('returns correct postgres values', () => {
    const indexerConfig = new IndexerConfig(REDIS_STREAM, ACCOUNT_ID, FUNCTION_NAME, 0, '', SCHEMA, LogLevel.INFO);

    expect(indexerConfig.userName()).toEqual('test_account_near');
    expect(indexerConfig.databaseName()).toEqual('test_account_near');
    expect(indexerConfig.schemaName()).toEqual('test_account_near_test_indexer');
  });

  test('returns correct postgres values for account starting with number', () => {
    const indexerConfig = new IndexerConfig(REDIS_STREAM, '0xSome-Account', FUNCTION_NAME, 0, '', SCHEMA, LogLevel.INFO);

    expect(indexerConfig.userName()).toEqual('_0xSome_Account');
    expect(indexerConfig.databaseName()).toEqual('_0xSome_Account');
    expect(indexerConfig.schemaName()).toEqual('_0xSome_Account_test_indexer');
  });
});
