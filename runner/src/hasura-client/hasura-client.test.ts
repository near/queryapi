import type fetch from 'node-fetch';

import HasuraClient, {
  type HasuraConfiguration,
  type HasuraDatabaseConnectionParameters,
  type HasuraMetadata,
  type HasuraSource,
  type HasuraTableMetadata
} from './hasura-client';

const DEFAULT_HASURA_SOURCE: HasuraSource = {
  name: 'default',
  kind: 'postgres',
  tables: [],
  configuration: {
    connection_info: {
      database_url: { from_env: 'HASURA_GRAPHQL_DATABASE_URL' },
    }
  }
};

describe('HasuraClient', () => {
  const config = {
    adminSecret: 'mock-hasura-admin-secret',
    endpoint: 'mock-hasura-endpoint',
    pgHost: 'localhost',
    pgPort: '5432',
  };

  it('creates a schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.createSchema('dbName', 'schemaName');

    expect(mockFetch.mock.calls).toMatchSnapshot();
  });

  it('drops a schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.dropSchema('dbName', 'schemaName');

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
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

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
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await expect(client.doesSourceExist('name')).resolves.toBe(true);
    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('runs migrations for the specified schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.executeSqlOnSchema('dbName', 'schemaName', 'CREATE TABLE blocks (height numeric)');

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
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    const names = await client.getTableNames('schema', 'source');

    expect(names).toEqual(['height', 'width']);
    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('gets tracked tables and their permissions for a schema', async () => {
    const TEST_METADATA = generateTableMetadata(['schemaA', 'schemaB'], ['tableA', 'tableB'], 'role');
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({ metadata: TEST_METADATA })
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);
    const trackedTablePermissions = await client.getTrackedTablePermissions('role', 'schemaB');
    expect(trackedTablePermissions).toMatchSnapshot();
    expect(trackedTablePermissions[0].table).toEqual({ name: 'tableA', schema: 'schemaB' });
  });

  it('tracks the specified tables for a specified schema', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.trackTables('schema', ['height', 'width'], 'source');

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('untracks the specified tables', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

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
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.addPermissionsToTables('schema', 'default', ['height', 'width'], 'role', ['select', 'insert', 'update', 'delete']);

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('drops a datasource', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.dropDatasource('morgs_near');

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();
  });

  it('adds a datasource', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({})
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.addDatasource('morgs_near', 'password', 'morgs_near');

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
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
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.trackForeignKeyRelationships('public', 'source');

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchSnapshot();

    expect(mockFetch.mock.calls[0][1].headers['X-Hasura-Admin-Secret']).toBe(config.adminSecret);
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
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);

    await client.trackForeignKeyRelationships('public', 'source');

    expect(mockFetch).toBeCalledTimes(1); // to fetch the foreign keys
  });

  it('returns connection parameters for valid and invalid users', async () => {
    const testUsers = {
      testA_near: 'passA',
      testB_near: 'passB',
      testC_near: 'passC'
    };
    const TEST_METADATA = generateConnectionMetadata(testUsers);
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        status: 200,
        text: () => JSON.stringify({ metadata: TEST_METADATA })
      });
    const client = new HasuraClient({ fetch: mockFetch as unknown as typeof fetch }, config);
    const result = await client.getDbConnectionParameters('testB_near');
    expect(result).toEqual(generateConnectionParameter('testB_near', 'passB'));
    await expect(client.getDbConnectionParameters('fake_near')).rejects.toThrow('Could not find connection parameters for user fake_near on respective database.');
  });
});

function generateTableMetadata (schemaNames: string[], tableNames: string[], role: string): any {
  const sources: HasuraSource[] = [];
  // Insert default source which has different format than the rest
  sources.push(DEFAULT_HASURA_SOURCE);

  const tables: HasuraTableMetadata[] = [];
  schemaNames.forEach((schemaName) => {
    tableNames.forEach((tableName) => {
      tables.push(generateTableConfig(schemaName, tableName, role));
    });
  });

  sources.push({
    name: role,
    kind: 'postgres',
    tables,
    configuration: generateHasuraConfiguration(role, 'password'),
  });

  return {
    version: 3,
    sources
  };
}

function generateTableConfig (schemaName: string, tableName: string, role: string): HasuraTableMetadata {
  return {
    table: {
      name: tableName,
      schema: schemaName,
    },
    insert_permissions: [{ role, permission: {} }],
    select_permissions: [{ role, permission: {} }],
    update_permissions: [{ role, permission: {} }],
    delete_permissions: [{ role, permission: {} }],
  };
}

function generateConnectionMetadata (testUsers: any): HasuraMetadata {
  const sources: HasuraSource[] = [];
  // Insert default source which has different format than the rest
  sources.push({
    name: 'default',
    kind: 'postgres',
    tables: [],
    configuration: {
      connection_info: {
        database_url: { from_env: 'HASURA_GRAPHQL_DATABASE_URL' },
        isolation_level: 'read-committed',
        pool_settings: {
          connection_lifetime: 600,
          idle_timeout: 180,
          max_connections: 50,
          retries: 1
        },
        use_prepared_statements: true
      }
    }
  });

  Object.keys(testUsers).forEach((user) => {
    sources.push(generateSource(user, testUsers[user]));
  });

  return {
    version: 3,
    sources
  };
}

function generateSource (user: string, password: string): HasuraSource {
  return {
    name: user,
    kind: 'postgres',
    tables: [],
    configuration: generateHasuraConfiguration(user, password),
  };
}

function generateHasuraConfiguration (user: string, password: string): HasuraConfiguration {
  return {
    connection_info: {
      database_url: { connection_parameters: generateConnectionParameter(user, password) },
      isolation_level: 'read-committed',
      use_prepared_statements: false
    }
  };
}

function generateConnectionParameter (user: string, password: string): HasuraDatabaseConnectionParameters {
  return {
    database: user,
    host: 'postgres',
    password,
    port: 5432,
    username: user
  };
}
