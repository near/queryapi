import type fetch from 'node-fetch';

import HasuraClient from './hasura-client';

describe('HasuraClient', () => {
  const oldEnv = process.env;

  const HASURA_ENDPOINT = 'mock-hasura-endpoint';
  const HASURA_ADMIN_SECRET = 'mock-hasura-admin-secret';
  const PGHOST = 'localhost';
  const PGPORT = '5432';

  beforeAll(() => {
    process.env = {
      ...oldEnv,
      HASURA_ENDPOINT,
      HASURA_ADMIN_SECRET,
      PGHOST,
      PGPORT,
    };
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it('creates a schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.createSchema('dbName', 'schemaName');

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  it('checks if a schema exists within source', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({
          result: [['schema_name'], ['name']]
        })
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    const result = await client.doesSchemaExist('source', 'schema');

    expect(result).toBe(true);
    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  it('checks if datasource exists', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({
          metadata: {
            sources: [
              {
                name: 'name'
              }
            ]
          },
        }),
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await expect(client.doesSourceExist('name')).resolves.toBe(true);
    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('runs migrations for the specified schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.runMigrations('dbName', 'schemaName', 'CREATE TABLE blocks (height numeric)');

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  it('gets table names within a schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify([
          { name: 'table_name', schema: 'morgs_near' },
          { name: 'height', schema: 'schema' },
          { name: 'width', schema: 'schema' }
        ])
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    const names = await client.getTableNames('schema', 'source');

    expect(names).toEqual(['height', 'width']);
    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('tracks the specified tables for a specified schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.trackTables('schema', ['height', 'width'], 'source');

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('untracks the specified tables', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.untrackTables('default', 'schema', ['height', 'width']);

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  it('adds the specified permissions for the specified roles/table/schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.addPermissionsToTables('schema', 'default', ['height', 'width'], 'role', ['select', 'insert', 'update', 'delete']);

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('adds a datasource', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.addDatasource('morgs_near', 'password', 'morgs_near');

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('tracks foreign key relationships', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({
          result: [
            [
              'coalesce'
            ],
            [
              JSON.stringify([
                {
                  table_schema: 'public',
                  table_name: 'comments',
                  constraint_name: 'comments_post_id_fkey',
                  ref_table_table_schema: 'public',
                  ref_table: 'posts',
                  column_mapping: {
                    post_id: 'id'
                  },
                  on_update: 'a',
                  on_delete: 'a'
                },
                {
                  table_schema: 'public',
                  table_name: 'post_likes',
                  constraint_name: 'post_likes_post_id_fkey',
                  ref_table_table_schema: 'public',
                  ref_table: 'posts',
                  column_mapping: {
                    post_id: 'id'
                  },
                  on_update: 'a',
                  on_delete: 'c'
                }
              ])
            ]
          ]
        }),
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.trackForeignKeyRelationships('public', 'source');

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();

    expect(mockFetch.mock.calls[1][1].headers['X-Hasura-Admin-Secret']).toBe(HASURA_ADMIN_SECRET);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toMatchSnapshot();
  });

  it('skips foreign key tracking if none exist', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({
          result: [
            [
              'coalesce'
            ],
            [
              JSON.stringify([])
            ]
          ]
        }),
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch });

    await client.trackForeignKeyRelationships('public', 'source');

    expect(mockFetch).toBeCalledTimes(1); // to fetch the foreign keys
  });
});
