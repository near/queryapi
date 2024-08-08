import { Block, type StreamerMessage } from '@near-lake/primitives';

import Indexer from './indexer';
import { VM } from 'vm2';
import type { DmlHandler } from './dml-handler';
import { LogLevel } from '../indexer-meta/log-entry';
import IndexerConfig from '../indexer-config/indexer-config';
import { IndexerStatus } from '../indexer-meta';
import type IndexerMeta from '../indexer-meta';
import ContextBuilder from './context-builder';
import { type ContextObject } from './context-builder';

describe('Indexer unit tests', () => {
  const SIMPLE_REDIS_STREAM = 'test:stream';
  const SIMPLE_ACCOUNT_ID = 'morgs.near';
  const SIMPLE_FUNCTION_NAME = 'test_indexer';
  const SIMPLE_CODE = 'const a = 1;';
  const SIMPLE_SCHEMA = 'create table posts("id" SERIAL NOT NULL PRIMARY KEY);';
  const SIMPLE_INDEXER_CONFIG: IndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, SIMPLE_CODE, SIMPLE_SCHEMA, LogLevel.INFO);

  const genericMockContextObject = {
    graphql: jest.fn().mockResolvedValue({ data: 'mock' }),
    set: jest.fn().mockResolvedValue({ data: 'mock' }),
    debug: jest.fn().mockResolvedValue(null),
    log: jest.fn().mockResolvedValue(null),
    warn: jest.fn().mockResolvedValue(null),
    error: jest.fn().mockResolvedValue(null),
    fetchFromSocialApi: jest.fn().mockResolvedValue({ data: 'mock' }),
    db: {
      Posts: {
        insert: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
        select: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
        update: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
        upsert: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
        delete: jest.fn().mockResolvedValue([{ colA: 'valA' }])
      }
    },
  } as unknown as ContextObject;

  const genericMockContextBuilder = {
    buildContext: jest.fn().mockReturnValue(genericMockContextObject),
  } as unknown as ContextBuilder;

  const genericMockIndexerMeta: any = {
    writeLogs: jest.fn(),
    setStatus: jest.fn(),
    updateBlockHeight: jest.fn().mockResolvedValue(null),
  } as unknown as IndexerMeta;

  test('Indexer.execute() can call context object functions', async () => {
    const mockContextObject = {
      graphql: jest.fn().mockResolvedValue({ data: 'mock' }),
      set: jest.fn().mockResolvedValue({ data: 'mock' }),
      debug: jest.fn().mockResolvedValue(null),
      log: jest.fn().mockResolvedValue(null),
      warn: jest.fn().mockResolvedValue(null),
      error: jest.fn().mockResolvedValue(null),
      fetchFromSocialApi: jest.fn().mockResolvedValue({ data: 'mock' }),
      db: {
        Posts: {
          insert: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
          select: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
          update: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
          upsert: jest.fn().mockResolvedValue([{ colA: 'valA' }]),
          delete: jest.fn().mockResolvedValue([{ colA: 'valA' }])
        }
      },
    } as unknown as ContextObject;
    const mockContextBuilder = {
      buildContext: jest.fn().mockReturnValue(mockContextObject),
    } as unknown as ContextBuilder;

    const blockHeight = 456;
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;

    const code = `
      const foo = 3;
      await context.graphql('query { hello }');
      await context.log('log');
      await context.fetchFromSocialApi('query { hello }');
      await context.db.Posts.insert({ foo });
    `;
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn().mockResolvedValue(null),
    } as unknown as IndexerMeta;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      contextBuilder: mockContextBuilder,
      indexerMeta,
    });

    await indexer.execute(mockBlock);

    expect(mockContextObject.graphql).toHaveBeenCalledWith('query { hello }');
    expect(mockContextObject.log).toHaveBeenCalledWith('log');
    expect(mockContextObject.fetchFromSocialApi).toHaveBeenCalledWith('query { hello }');
    expect(mockContextObject.db.Posts.insert).toHaveBeenCalledWith({ foo: 3 });
    expect(indexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(indexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);
  });

  test('Errors thrown in VM can be caught outside the VM', async () => {
    const vm = new VM();
    expect(() => {
      vm.run("throw new Error('boom')");
    }).toThrow('boom');
  });

  test('Indexer.execute() catches errors', async () => {
    const blockHeight = 456;
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [0],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;
    const code = `
        throw new Error('boom');
    `;
    const indexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn().mockResolvedValue(null)
    } as unknown as IndexerMeta;
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, {
      contextBuilder: genericMockContextBuilder,
      indexerMeta,
    });

    await expect(indexer.execute(mockBlock)).rejects.toThrow(new Error('Execution error: boom'));
    expect(indexerMeta.setStatus).toHaveBeenNthCalledWith(1, IndexerStatus.RUNNING);
    expect(indexerMeta.setStatus).toHaveBeenNthCalledWith(2, IndexerStatus.FAILING);
    expect(indexerMeta.updateBlockHeight).not.toHaveBeenCalled();
  });

  test('Indexer passes all relevant logs to writeLogs', async () => {
    const mockDebugIndexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn().mockResolvedValue(null)
    };
    const mockInfoIndexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn().mockResolvedValue(null)
    };
    const mockErrorIndexerMeta = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn().mockResolvedValue(null)
    };
    const blockHeight = 456;
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;

    const code = `
      console.debug('debug log');
      console.log('info log');
      console.error('error log');
      await context.db.Posts.select({
        account_id: 'morgs_near',
        receipt_id: 'abc',
      });
    `;
    const debugIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.DEBUG);
    const infoIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.INFO);
    const errorIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.ERROR);
    const mockDmlHandler: DmlHandler = { select: jest.fn() } as unknown as DmlHandler;
    const partialMockContextBuilder: ContextBuilder = new ContextBuilder(SIMPLE_INDEXER_CONFIG, { dmlHandler: mockDmlHandler });

    const indexerDebug = new Indexer(
      debugIndexerConfig,
      {
        contextBuilder: partialMockContextBuilder,
        indexerMeta: mockDebugIndexerMeta as unknown as IndexerMeta
      },
    );
    const indexerInfo = new Indexer(
      infoIndexerConfig,
      {
        contextBuilder: partialMockContextBuilder,
        indexerMeta: mockInfoIndexerMeta as unknown as IndexerMeta
      },
    );
    const indexerError = new Indexer(
      errorIndexerConfig,
      {
        contextBuilder: partialMockContextBuilder,
        indexerMeta: mockErrorIndexerMeta as unknown as IndexerMeta
      },
    );

    await indexerDebug.execute(mockBlock);
    await indexerInfo.execute(mockBlock);
    await indexerError.execute(mockBlock);

    expect(mockDebugIndexerMeta.writeLogs.mock.calls[0][0].length).toEqual(5);
    expect(mockDebugIndexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(mockDebugIndexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(mockDebugIndexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);

    expect(mockInfoIndexerMeta.writeLogs.mock.calls[0][0].length).toEqual(5);
    expect(mockInfoIndexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(mockInfoIndexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(mockInfoIndexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);

    expect(mockErrorIndexerMeta.writeLogs.mock.calls[0][0].length).toEqual(5);
    expect(mockErrorIndexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(mockErrorIndexerMeta.setStatus).toHaveBeenCalledWith(IndexerStatus.RUNNING);
    expect(mockErrorIndexerMeta.updateBlockHeight).toHaveBeenCalledWith(blockHeight);
  });

  it('call writeLogs method at the end of execution with correct and all logs are present', async () => {
    const blockHeight = 456;
    const mockBlock = Block.fromStreamerMessage({
      block: {
        chunks: [],
        header: {
          height: blockHeight
        }
      },
      shards: {}
    } as unknown as StreamerMessage) as unknown as Block;

    const indexerMeta: any = {
      writeLogs: jest.fn(),
      setStatus: jest.fn(),
      updateBlockHeight: jest.fn().mockResolvedValue(null),
    };

    const code = `
      console.debug('debug log');
      console.log('info log');
      console.error('error log');
      await context.db.Posts.select({
        account_id: 'morgs_near',
        receipt_id: 'abc',
      });
    `;

    const debugIndexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, 'buildnear.testnet', 'test', 0, code, SIMPLE_SCHEMA, LogLevel.DEBUG);
    const mockDmlHandler: DmlHandler = { select: jest.fn() } as unknown as DmlHandler;
    const partialMockContextBuilder: ContextBuilder = new ContextBuilder(debugIndexerConfig, { dmlHandler: mockDmlHandler });
    const indexerDebug = new Indexer(
      debugIndexerConfig,
      { contextBuilder: partialMockContextBuilder, indexerMeta },
    );

    await indexerDebug.execute(mockBlock);
    expect(indexerMeta.writeLogs).toHaveBeenCalledTimes(1);
    expect(indexerMeta.writeLogs.mock.calls[0][0]).toHaveLength(5);
  });

  test('transformedCode applies the correct transformations', () => {
    const indexerConfig = new IndexerConfig(SIMPLE_REDIS_STREAM, SIMPLE_ACCOUNT_ID, SIMPLE_FUNCTION_NAME, 0, 'console.log(\'hello\')', SIMPLE_SCHEMA, LogLevel.INFO);
    const indexer = new Indexer(indexerConfig, { contextBuilder: genericMockContextBuilder, indexerMeta: genericMockIndexerMeta });
    const transformedFunction = indexer.transformIndexerFunction();

    expect(transformedFunction).toEqual(`
      async function f(){
        console.log('hello')
      };
      f();
    `);
  });
});
