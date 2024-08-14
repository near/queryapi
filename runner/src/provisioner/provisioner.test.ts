import pgFormat from 'pg-format';

import Provisioner, { LOGS_TABLE_NAME, METADATA_TABLE_NAME } from './provisioner';
import IndexerConfig from '../indexer-config/indexer-config';
import { LogLevel } from '../indexer-meta/log-entry';
import { type HasuraTableMetadata, type HasuraMetadata, type HasuraSource } from './hasura-client';

describe('Provisioner', () => {
  let adminPgClient: any;
  let cronPgClient: any;
  let hasuraClient: any;
  let provisioner: Provisioner;
  let userPgClientQuery: any;
  let indexerConfig: IndexerConfig;

  const tableNames = ['blocks'];
  const systemTables = [METADATA_TABLE_NAME, LOGS_TABLE_NAME];
  const tableNamesWithSystemTables = ['blocks', ...systemTables];
  const accountId = 'morgs.near';
  const functionName = 'test-function';
  const databaseSchema = 'CREATE TABLE blocks (height numeric)';
  indexerConfig = new IndexerConfig('', accountId, functionName, 0, '', databaseSchema, LogLevel.INFO);
  const emptyHasuraMetadata = generateDefaultHasuraMetadata();
  const hasuraMetadataWithEmptySource = generateDefaultHasuraMetadata();
  hasuraMetadataWithEmptySource.sources.push(generateSourceWithTables([], [], indexerConfig.userName(), indexerConfig.databaseName()));
  const hasuraMetadataWithSystemProvisions = generateDefaultHasuraMetadata();
  hasuraMetadataWithSystemProvisions.sources.push(generateSourceWithTables([indexerConfig.schemaName()], systemTables, indexerConfig.userName(), indexerConfig.databaseName()));
  const hasuraMetadataWithProvisions = generateDefaultHasuraMetadata();
  hasuraMetadataWithProvisions.sources.push(generateSourceWithTables([indexerConfig.schemaName()], tableNamesWithSystemTables, indexerConfig.userName(), indexerConfig.databaseName()));
  const testingRetryConfig = {
    maxRetries: 5,
    baseDelay: 10
  };
  const setProvisioningStatusQuery = `INSERT INTO ${indexerConfig.schemaName()}.${METADATA_TABLE_NAME} (attribute, value) VALUES ('STATUS', 'PROVISIONING') ON CONFLICT (attribute) DO UPDATE SET value = EXCLUDED.value RETURNING *`;
  const logsDDL = expect.any(String);
  const metadataDDL = expect.any(String);
  const error = new Error('some error');

  const password = 'password';
  const crypto: any = {
    randomBytes: () => ({
      toString: () => ({
        slice: () => ({
          replace: () => password,
        }),
      }),
    }),
  };

  beforeEach(() => {
    hasuraClient = {
      exportMetadata: jest.fn().mockResolvedValueOnce(emptyHasuraMetadata).mockResolvedValue(hasuraMetadataWithSystemProvisions),
      getTableNames: jest.fn().mockResolvedValueOnce([]).mockResolvedValue(tableNamesWithSystemTables),
      trackTables: jest.fn().mockReturnValueOnce(null),
      trackForeignKeyRelationships: jest.fn().mockReturnValueOnce(null),
      addPermissionsToTables: jest.fn().mockReturnValueOnce(null),
      addDatasource: jest.fn().mockReturnValueOnce(null),
      dropDatasource: jest.fn().mockReturnValueOnce(null),
      executeSqlOnSchema: jest.fn().mockReturnValueOnce(null),
      createSchema: jest.fn().mockReturnValueOnce(null),
      dropSchema: jest.fn().mockReturnValueOnce(null),
      doesSourceExist: jest.fn().mockReturnValueOnce(false),
      doesSchemaExist: jest.fn().mockReturnValueOnce(false),
      untrackTables: jest.fn().mockReturnValueOnce(null),
      getDbConnectionParameters: jest.fn().mockReturnValue({}),
    };

    adminPgClient = {
      query: jest.fn().mockReturnValue(null),
      end: jest.fn()
    };

    cronPgClient = {
      query: jest.fn().mockReturnValue(null),
      end: jest.fn()
    };

    userPgClientQuery = jest.fn().mockReturnValue(null);
    const PgClient = jest.fn().mockImplementation(() => {
      return {
        query: userPgClientQuery,
        end: jest.fn()
      };
    });

    const IndexerMeta = jest.fn().mockImplementation(() => {
      return {
        writeLogs: jest.fn()
      };
    });

    provisioner = new Provisioner(hasuraClient, adminPgClient, cronPgClient, undefined, crypto, pgFormat, PgClient as any, testingRetryConfig, IndexerMeta);

    indexerConfig = new IndexerConfig('', accountId, functionName, 0, '', databaseSchema, LogLevel.INFO);
  });

  describe('deprovision', () => {
    it('removes schema level resources', async () => {
      userPgClientQuery = jest.fn()
        .mockResolvedValueOnce(null) // unschedule create partition job
        .mockResolvedValueOnce(null) // unschedule delete partition job
        .mockResolvedValueOnce({ rows: [{ schema_name: 'another_one' }] }); // list schemas

      await provisioner.deprovision(indexerConfig);

      expect(hasuraClient.dropSchema).toBeCalledWith(indexerConfig.databaseName(), indexerConfig.schemaName());
      expect(userPgClientQuery.mock.calls).toEqual([
        ["SELECT cron.unschedule('morgs_near_test_function_sys_logs_create_partition');"],
        ["SELECT cron.unschedule('morgs_near_test_function_sys_logs_delete_partition');"],
        ["SELECT schema_name FROM information_schema.schemata WHERE schema_owner = 'morgs_near'"],
      ]);
    });

    it('removes database level resources', async () => {
      userPgClientQuery = jest.fn()
        .mockResolvedValueOnce(null) // unschedule create partition job
        .mockResolvedValueOnce(null) // unschedule delete partition job
        .mockResolvedValueOnce({ rows: [] }); // list schemas

      await provisioner.deprovision(indexerConfig);

      expect(hasuraClient.dropSchema).toBeCalledWith(indexerConfig.databaseName(), indexerConfig.schemaName());
      expect(userPgClientQuery.mock.calls).toEqual([
        ["SELECT cron.unschedule('morgs_near_test_function_sys_logs_create_partition');"],
        ["SELECT cron.unschedule('morgs_near_test_function_sys_logs_delete_partition');"],
        ["SELECT schema_name FROM information_schema.schemata WHERE schema_owner = 'morgs_near'"],
      ]);
      expect(hasuraClient.dropDatasource).toBeCalledWith(indexerConfig.databaseName());
      expect(adminPgClient.query).toBeCalledWith('DROP DATABASE IF EXISTS morgs_near (FORCE)');
      expect(cronPgClient.query).toBeCalledWith('REVOKE USAGE ON SCHEMA cron FROM morgs_near CASCADE');
      expect(cronPgClient.query).toBeCalledWith('REVOKE EXECUTE ON FUNCTION cron.schedule_in_database FROM morgs_near;');
      expect(adminPgClient.query).toBeCalledWith('DROP ROLE IF EXISTS morgs_near');
    });

    it('handles revoke cron failures', async () => {
      userPgClientQuery = jest.fn()
        .mockResolvedValueOnce(null) // unschedule create partition job
        .mockResolvedValueOnce(null) // unschedule delete partition job
        .mockResolvedValueOnce({ rows: [] }); // list schemas

      cronPgClient.query = jest.fn()
        .mockRejectedValue(new Error('failed revoke'));

      await expect(provisioner.deprovision(indexerConfig)).rejects.toThrow('Failed to deprovision: Failed to revoke cron access: failed revoke');
    });

    it('handles drop role failures', async () => {
      userPgClientQuery = jest.fn()
        .mockResolvedValueOnce(null) // unschedule create partition job
        .mockResolvedValueOnce(null) // unschedule delete partition job
        .mockResolvedValueOnce({ rows: [] }); // list schemas

      adminPgClient.query = jest.fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValue(new Error('failed to drop role'));

      await expect(provisioner.deprovision(indexerConfig)).rejects.toThrow('Failed to deprovision: Failed to drop role: failed to drop role');
    });

    it('handles drop database failures', async () => {
      userPgClientQuery = jest.fn()
        .mockResolvedValueOnce(null) // unschedule create partition job
        .mockResolvedValueOnce(null) // unschedule delete partition job
        .mockResolvedValueOnce({ rows: [] }); // list schemas

      adminPgClient.query = jest.fn().mockRejectedValue(new Error('failed to drop db'));

      await expect(provisioner.deprovision(indexerConfig)).rejects.toThrow('Failed to deprovision: Failed to drop database: failed to drop db');
    });

    it('handles drop datasource failures', async () => {
      userPgClientQuery = jest.fn()
        .mockResolvedValueOnce(null) // unschedule create partition job
        .mockResolvedValueOnce(null) // unschedule delete partition job
        .mockResolvedValueOnce({ rows: [] }); // list schemas

      hasuraClient.dropDatasource = jest.fn().mockRejectedValue(new Error('failed to drop datasource'));

      await expect(provisioner.deprovision(indexerConfig)).rejects.toThrow('Failed to deprovision: Failed to drop datasource: failed to drop');
    });

    it('handles drop schema failures', async () => {
      hasuraClient.dropSchema = jest.fn().mockRejectedValue(new Error('failed to drop schema'));
      await expect(provisioner.deprovision(indexerConfig)).rejects.toThrow('Failed to deprovision: Failed to drop schema: failed to drop');
    });

    it('handles remove log job failures', async () => {
      userPgClientQuery = jest.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('failed to remove jobs'));
      await expect(provisioner.deprovision(indexerConfig)).rejects.toThrow('Failed to deprovision: Failed to unschedule log partition jobs: failed to remove jobs');
    });
  });

  describe('isUserApiProvisioned', () => {
    it('returns false if datasource doesnt exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);

      await expect(provisioner.isProvisioned(indexerConfig)).resolves.toBe(false);
    });

    it('returns false if datasource and schema dont exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(false);

      await expect(provisioner.isProvisioned(indexerConfig)).resolves.toBe(false);
    });

    it('returns true if datasource and schema exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(true);

      await expect(provisioner.isProvisioned(indexerConfig)).resolves.toBe(true);
    });
  });

  describe('provisionUserApi', () => {
    it('provisions an API for the user', async () => {
      await provisioner.provisionUserApi(indexerConfig);

      expect(adminPgClient.query.mock.calls).toEqual([
        ['CREATE DATABASE morgs_near'],
        ['CREATE USER morgs_near WITH PASSWORD \'password\''],
        ['GRANT ALL PRIVILEGES ON DATABASE morgs_near TO morgs_near'],
        ['REVOKE CONNECT ON DATABASE morgs_near FROM PUBLIC'],
      ]);

      expect(cronPgClient.query.mock.calls).toEqual([
        ['GRANT USAGE ON SCHEMA cron TO morgs_near'],
        ['GRANT EXECUTE ON FUNCTION cron.schedule_in_database TO morgs_near;'],
      ]);
      expect(userPgClientQuery.mock.calls).toEqual([
        [setProvisioningStatusQuery],
        ["SELECT cron.schedule_in_database('morgs_near_test_function_sys_logs_create_partition', '0 1 * * *', $$SELECT morgs_near_test_function.fn_create_partition('morgs_near_test_function.sys_logs', CURRENT_DATE, '1 day', '2 day')$$, 'morgs_near');"],
        ["SELECT cron.schedule_in_database('morgs_near_test_function_sys_logs_delete_partition', '0 2 * * *', $$SELECT morgs_near_test_function.fn_delete_partition('morgs_near_test_function.sys_logs', CURRENT_DATE, '-15 day', '-14 day')$$, 'morgs_near');"]
      ]);
      expect(hasuraClient.addDatasource).toBeCalledWith(indexerConfig.userName(), password, indexerConfig.databaseName());
      expect(hasuraClient.createSchema).toBeCalledWith(indexerConfig.userName(), indexerConfig.schemaName());
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(1, indexerConfig.userName(), indexerConfig.schemaName(), metadataDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(2, indexerConfig.userName(), indexerConfig.schemaName(), logsDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(3, indexerConfig.userName(), indexerConfig.schemaName(), databaseSchema);
      expect(hasuraClient.getTableNames).toBeCalledWith(indexerConfig.schemaName(), indexerConfig.databaseName());
      expect(hasuraClient.trackTables).toHaveBeenNthCalledWith(1, indexerConfig.schemaName(), [METADATA_TABLE_NAME, LOGS_TABLE_NAME], indexerConfig.databaseName());
      expect(hasuraClient.trackTables).toHaveBeenNthCalledWith(2, indexerConfig.schemaName(), tableNames, indexerConfig.databaseName());
      expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
        indexerConfig.schemaName(),
        indexerConfig.databaseName(),
        [METADATA_TABLE_NAME, LOGS_TABLE_NAME],
        indexerConfig.userName(),
        [
          'select',
          'insert',
          'update',
          'delete'
        ]
      );
      expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
        indexerConfig.schemaName(),
        indexerConfig.databaseName(),
        tableNames,
        indexerConfig.userName(),
        [
          'select',
          'insert',
          'update',
          'delete'
        ]
      );
    });

    it('skips provisioning the datasource if it already exists', async () => {
      hasuraClient.exportMetadata = jest.fn().mockResolvedValueOnce(hasuraMetadataWithEmptySource).mockResolvedValue(hasuraMetadataWithSystemProvisions);

      await provisioner.provisionUserApi(indexerConfig);

      expect(adminPgClient.query).not.toBeCalled();
      expect(hasuraClient.addDatasource).not.toBeCalled();

      expect(hasuraClient.createSchema).toBeCalledWith(indexerConfig.userName(), indexerConfig.schemaName());
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(1, indexerConfig.userName(), indexerConfig.schemaName(), metadataDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(2, indexerConfig.userName(), indexerConfig.schemaName(), logsDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(3, indexerConfig.databaseName(), indexerConfig.schemaName(), databaseSchema);
      expect(hasuraClient.getTableNames).toBeCalledWith(indexerConfig.schemaName(), indexerConfig.databaseName());
      expect(hasuraClient.trackTables).toHaveBeenNthCalledWith(1, indexerConfig.schemaName(), [METADATA_TABLE_NAME, LOGS_TABLE_NAME], indexerConfig.databaseName());
      expect(hasuraClient.trackTables).toHaveBeenNthCalledWith(2, indexerConfig.schemaName(), tableNames, indexerConfig.databaseName());
      expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
        indexerConfig.schemaName(),
        indexerConfig.databaseName(),
        [METADATA_TABLE_NAME, LOGS_TABLE_NAME],
        indexerConfig.userName(),
        [
          'select',
          'insert',
          'update',
          'delete'
        ]
      );
      expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
        indexerConfig.schemaName(),
        indexerConfig.databaseName(),
        tableNames,
        indexerConfig.userName(),
        [
          'select',
          'insert',
          'update',
          'delete'
        ]
      );
    });

    it('skips all provisioning if all provisioning tasks already done', async () => {
      hasuraClient.exportMetadata = jest.fn().mockResolvedValue(hasuraMetadataWithProvisions);
      hasuraClient.getTableNames = jest.fn().mockResolvedValue(tableNamesWithSystemTables);

      await provisioner.provisionUserApi(indexerConfig);

      expect(adminPgClient.query).not.toBeCalled();
      expect(hasuraClient.addDatasource).not.toBeCalled();

      expect(hasuraClient.createSchema).not.toBeCalled();
      expect(hasuraClient.executeSqlOnSchema).not.toBeCalled();
      expect(hasuraClient.trackTables).not.toBeCalled();
      expect(hasuraClient.trackForeignKeyRelationships).toHaveBeenCalledTimes(1);
      expect(hasuraClient.addPermissionsToTables).not.toBeCalled();
    });

    it('formats user input before executing the query', async () => {
      await provisioner.createUserDb('morgs_near', 'pass; DROP TABLE users;--', 'databaseName UNION SELECT * FROM users --');

      expect(adminPgClient.query.mock.calls).toMatchSnapshot();
    });

    it('throws an error when it fails to create a postgres db', async () => {
      adminPgClient.query = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to create user db: some error');
    });

    it('throws an error when it fails to add the db to hasura', async () => {
      hasuraClient.addDatasource = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to add datasource: some error');
    });

    it('throws an error when it fails to run sql to create indexer sql', async () => {
      hasuraClient.executeSqlOnSchema = jest.fn().mockRejectedValue(error);

      await expect(provisioner.runIndexerSql(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to run user script: some error');
    });

    it('throws an error when it fails to run sql to create logs sql', async () => {
      hasuraClient.executeSqlOnSchema = jest.fn().mockRejectedValue(error);

      await expect(provisioner.runLogsSql(accountId, functionName)).rejects.toThrow('Failed to run logs script: some error');
    });

    it('throws an error when it fails to run sql to create indexer sql', async () => {
      hasuraClient.executeSqlOnSchema = jest.fn().mockRejectedValue(error);

      await expect(provisioner.runIndexerSql(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to run user script: some error');
    });

    it('throws an error when it fails to run sql to create logs sql', async () => {
      hasuraClient.executeSqlOnSchema = jest.fn().mockRejectedValue(error);

      await expect(provisioner.runLogsSql(accountId, functionName)).rejects.toThrow('Failed to run logs script: some error');
    });

    it('throws an error when it fails to track tables', async () => {
      hasuraClient.trackTables = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to track tables: some error');
    });

    it('throws an error when it fails to track foreign key relationships', async () => {
      hasuraClient.trackForeignKeyRelationships = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to track foreign key relationships: some error');
      expect(hasuraClient.trackForeignKeyRelationships).toHaveBeenCalledTimes(testingRetryConfig.maxRetries);
    });

    it('throws an error when it fails to add permissions to tables', async () => {
      hasuraClient.addPermissionsToTables = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to add permissions to tables: some error');
      expect(hasuraClient.addPermissionsToTables).toHaveBeenCalledTimes(testingRetryConfig.maxRetries);
    });

    it('throws when grant cron access fails', async () => {
      cronPgClient.query = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to grant cron access: some error');
    });

    it('throws when scheduling cron jobs fails', async () => {
      userPgClientQuery = jest.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(error); // Succeed setting provisioning status first

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to schedule log partition jobs: some error');
    });

    it('get credentials for postgres', async () => {
      const getDbConnectionParameters = jest.fn().mockReturnValue({
        username: 'username',
        password: 'password',
        database: 'database',
        host: 'hasura_host',
        port: 'hasura_port',
      });
      hasuraClient.getDbConnectionParameters = getDbConnectionParameters;

      const mockProvisioner = new Provisioner(hasuraClient, {} as any, {} as any, {
        cronDatabase: 'cron_database',
        postgresHost: 'postgres_host',
        postgresPort: 1,
        pgBouncerHost: 'pgbouncer_host',
        pgBouncerPort: 2,
      });

      const params = await mockProvisioner.getPostgresConnectionParameters(indexerConfig.userName());
      expect(params).toEqual({
        user: 'username',
        password: 'password',
        database: 'database',
        host: 'postgres_host',
        port: 1,
      });
    });

    it('get credentials for pgbouncer', async () => {
      const getDbConnectionParameters = jest.fn().mockReturnValue({
        username: 'username',
        password: 'password',
        database: 'database',
        host: 'hasura_host',
        port: 'hasura_port',
      });
      hasuraClient.getDbConnectionParameters = getDbConnectionParameters;

      const mockProvisioner = new Provisioner(hasuraClient, {} as any, {} as any, {
        cronDatabase: 'cron_database',
        postgresHost: 'postgres_host',
        postgresPort: 1,
        pgBouncerHost: 'pgbouncer_host',
        pgBouncerPort: 2,
      });

      const params = await mockProvisioner.getPgBouncerConnectionParameters(indexerConfig.userName());
      expect(params).toEqual({
        user: 'username',
        password: 'password',
        database: 'database',
        host: 'pgbouncer_host',
        port: 2,
      });
    });
  });
});

function generateDefaultHasuraMetadata (): HasuraMetadata {
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
    configuration: {} as any,
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
