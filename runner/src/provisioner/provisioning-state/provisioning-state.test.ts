import { ProvisioningConfig } from '../../indexer-config';
import { LogLevel } from '../../indexer-meta/log-entry';
import type HasuraClient from '../hasura-client';
import { type HasuraTableMetadata, type HasuraConfiguration, type HasuraDatabaseConnectionParameters, type HasuraSource, type HasuraMetadata } from '../hasura-client';
import ProvisioningState from './provisioning-state';

describe('ProvisioiningState', () => {
  const provisioningConfig = new ProvisioningConfig(
    'account-id',
    'function-name',
    'schema',
    LogLevel.INFO,
  );

  it('can create state whether source exists or not', async () => {
    const sourceWithoutUser = generateSourceWithTables(['some_schema'], ['tableA', 'tableB'], 'someAccount');
    const mockExportMetadata = jest.fn().mockResolvedValue(sourceWithoutUser);
    const mockGetTableNames = jest.fn().mockResolvedValue([]);
    const mockHasuraClient = {
      exportMetadata: mockExportMetadata,
      getTableNames: mockGetTableNames,
    } as unknown as HasuraClient;

    const provisioningState = await ProvisioningState.loadProvisioningState(mockHasuraClient, provisioningConfig);
    expect(provisioningState.doesSourceExist()).toBe(false);
    expect(provisioningState.doesSchemaExist()).toBe(false);
    expect(provisioningState.getCreatedTables()).toEqual([]);
  });
});

function generateSourceWithTables (schemaNames: string[], tableNames: string[], role: string): HasuraMetadata {
  const sources: HasuraSource[] = [];
  // Insert default source which has different format than the rest
  sources.push({
    name: 'default',
    kind: 'postgres',
    tables: [],
    configuration: {
      connection_info: {
        database_url: { from_env: 'HASURA_GRAPHQL_DATABASE_URL' },
      }
    }
  });

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
