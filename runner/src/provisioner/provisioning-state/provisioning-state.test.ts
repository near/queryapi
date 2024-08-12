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
    const metadataWithoutUser = generateHasuraMetadata(['some_schema'], ['tableA', 'tableB'], 'someAccount', 'someDb');
    const mockExportMetadata = jest.fn().mockResolvedValue(metadataWithoutUser);
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

  it('state works with existing source', async () => {
    const metadataWithUser = generateHasuraMetadata([provisioningConfig.schemaName(), 'some_schema'], ['tableA', 'tableB'], provisioningConfig.hasuraRoleName(), provisioningConfig.databaseName());
    metadataWithUser.sources.push(generateSourceWithTables(['anotherSchema'], ['anotherTable'], 'anotherRole', 'anotherDb'));
    const mockExportMetadata = jest.fn().mockResolvedValue(metadataWithUser);
    const mockGetTableNames = jest.fn().mockResolvedValue(['tableA']);
    const mockHasuraClient = {
      exportMetadata: mockExportMetadata,
      getTableNames: mockGetTableNames,
    } as unknown as HasuraClient;

    const provisioningState = await ProvisioningState.loadProvisioningState(mockHasuraClient, provisioningConfig);
    expect(provisioningState.doesSourceExist()).toBe(true);
    expect(provisioningState.doesSchemaExist()).toBe(true);
    expect(provisioningState.getCreatedTables()).toEqual(['tableA']);
  });

  it('correctly fetch metadata for existing source and schema', async () => {
    const metadataWithUser = generateHasuraMetadata([provisioningConfig.schemaName(), 'some_schema'], ['tableA', 'tableB'], provisioningConfig.hasuraRoleName(), provisioningConfig.databaseName());
    metadataWithUser.sources.push(generateSourceWithTables(['anotherSchema'], ['anotherTable'], 'anotherRole', 'anotherDb'));
    const mockExportMetadata = jest.fn().mockResolvedValue(metadataWithUser);
    const mockGetTableNames = jest.fn().mockResolvedValue(['tableA']);
    const mockHasuraClient = {
      exportMetadata: mockExportMetadata,
      getTableNames: mockGetTableNames,
    } as unknown as HasuraClient;

    const provisioningState = await ProvisioningState.loadProvisioningState(mockHasuraClient, provisioningConfig);
    expect(provisioningState.getSourceMetadata().name).toBe(provisioningConfig.hasuraRoleName());
    expect(provisioningState.getMetadataForTables().length).toBe(2);
    expect(provisioningState.getMetadataForTables()).toMatchSnapshot();
    expect(provisioningState.getTrackedTables()).toEqual(['tableA', 'tableB']);
    expect(provisioningState.getTablesWithPermissions()).toEqual(['tableA', 'tableB']);
  });

  it('handles table with missing permissions', async () => {
    const metadataWithUser = generateHasuraMetadata([provisioningConfig.schemaName(), 'some_schema'], ['tableA', 'tableB'], provisioningConfig.hasuraRoleName(), provisioningConfig.databaseName());
    const role = provisioningConfig.hasuraRoleName();
    const tableMissingPermissions = {
      table: {
        name: 'tableC',
        schema: provisioningConfig.schemaName(),
      },
      insert_permissions: [{ role, permission: {} }],
      update_permissions: [{ role, permission: {} }],
      delete_permissions: [{ role, permission: {} }],
    };
    const tableWithIncorrectlyNamedPermission = {
      table: {
        name: 'tableD',
        schema: provisioningConfig.schemaName(),
      },
      select_permissions: [{ role, permission: {} }],
      insert_permission: [{ role, permission: {} }],
      update_permissions: [{ role, permission: {} }],
      delete_permissions: [{ role, permission: {} }],
    };
    metadataWithUser.sources[1].tables.push(tableMissingPermissions); // First source is a default source
    metadataWithUser.sources[1].tables.push(tableWithIncorrectlyNamedPermission);

    const mockExportMetadata = jest.fn().mockResolvedValue(metadataWithUser);
    const mockGetTableNames = jest.fn().mockResolvedValue(['tableA']);
    const mockHasuraClient = {
      exportMetadata: mockExportMetadata,
      getTableNames: mockGetTableNames,
    } as unknown as HasuraClient;

    const provisioningState = await ProvisioningState.loadProvisioningState(mockHasuraClient, provisioningConfig);
    expect(provisioningState.getSourceMetadata().name).toBe(provisioningConfig.hasuraRoleName());
    expect(provisioningState.getMetadataForTables().length).toBe(4);
    expect(provisioningState.getMetadataForTables()).toMatchSnapshot();
    expect(provisioningState.getTrackedTables()).toEqual(['tableA', 'tableB', 'tableC', 'tableD']);
    expect(provisioningState.getTablesWithPermissions()).toEqual(['tableA', 'tableB']);
  });

  it('throws error when multiple sources with same name exist', async () => {
    const metadataWithUser = generateHasuraMetadata([provisioningConfig.schemaName(), 'some_schema'], ['tableA', 'tableB'], provisioningConfig.hasuraRoleName(), provisioningConfig.databaseName());
    metadataWithUser.sources.push(generateSourceWithTables(['anotherSchema'], ['anotherTable'], provisioningConfig.hasuraRoleName(), provisioningConfig.databaseName()));
    const mockExportMetadata = jest.fn().mockResolvedValue(metadataWithUser);
    const mockGetTableNames = jest.fn().mockResolvedValue(['tableA']);
    const mockHasuraClient = {
      exportMetadata: mockExportMetadata,
      getTableNames: mockGetTableNames,
    } as unknown as HasuraClient;

    const provisioningState = await ProvisioningState.loadProvisioningState(mockHasuraClient, provisioningConfig);
    expect(() => provisioningState.getSourceMetadata()).toThrow('Expected exactly one source');
    expect(() => provisioningState.getMetadataForTables()).toThrow('Expected exactly one source');
    expect(() => provisioningState.getTrackedTables()).toThrow('Expected exactly one source');
  });
});

function generateHasuraMetadata (schemaNames: string[], tableNames: string[], role: string, db: string): HasuraMetadata {
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

  sources.push(generateSourceWithTables(schemaNames, tableNames, role, db));

  return {
    version: 3,
    sources
  };
}

function generateSourceWithTables (schemaNames: string[], tableNames: string[], role: string, db: string): HasuraSource {
  const tables: HasuraTableMetadata[] = [];
  schemaNames.forEach((schemaName) => {
    tableNames.forEach((tableName) => {
      tables.push(generateTableConfig(schemaName, tableName, role));
    });
  });

  return {
    name: db,
    kind: 'postgres',
    tables,
    configuration: generateHasuraConfiguration(role, 'password'),
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
