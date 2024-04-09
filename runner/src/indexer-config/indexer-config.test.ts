import { LogLevel } from '../indexer-meta/indexer-meta';
import IndexerConfig from './indexer-config';

describe('IndexerConfig unit tests', () => {
  const REDIS_STREAM = 'test:stream';
  const ACCOUNT_ID = 'morgs.near';
  const FUNCTION_NAME = 'test_indexer';
  // const CODE = '';
  const SCHEMA = '';

  test('transformedCode applies the correct transformations', () => {
    const indexerConfig = new IndexerConfig(REDIS_STREAM, ACCOUNT_ID, FUNCTION_NAME, 0, 'console.log(\'hello\')', SCHEMA, LogLevel.INFO);

    const transformedFunction = indexerConfig.transformedCode();

    expect(transformedFunction).toEqual(`
      async function f(){
        console.log('hello')
      };
      f();
    `);
  });
});
