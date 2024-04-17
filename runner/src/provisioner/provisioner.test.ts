import pgFormat from 'pg-format';

import Provisioner from './provisioner';
import IndexerConfig from '../indexer-config/indexer-config';
import { LogLevel } from '../indexer-meta/log-entry';
import IndexerMeta, { IndexerStatus } from '../indexer-meta';

describe('Provisioner', () => {
  let adminPgClient: any;
  let cronPgClient: any;
  let hasuraClient: any;
  let provisioner: Provisioner;
  let userPgClientQuery: any;
  let indexerConfig: any;

  const tableNames = ['blocks'];
  const accountId = 'morgs.near';
  const functionName = 'test-function';
  const databaseSchema = 'CREATE TABLE blocks (height numeric)';
  indexerConfig = new IndexerConfig('', accountId, functionName, 0, '', databaseSchema, LogLevel.INFO);
  const setProvisioningStatusQuery = IndexerMeta.createSetStatusQuery(IndexerStatus.PROVISIONING, indexerConfig.schemaName());
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
      getTableNames: jest.fn().mockReturnValueOnce(tableNames),
      trackTables: jest.fn().mockReturnValueOnce(null),
      trackForeignKeyRelationships: jest.fn().mockReturnValueOnce(null),
      addPermissionsToTables: jest.fn().mockReturnValueOnce(null),
      addDatasource: jest.fn().mockReturnValueOnce(null),
      executeSqlOnSchema: jest.fn().mockReturnValueOnce(null),
      createSchema: jest.fn().mockReturnValueOnce(null),
      setupPartitionedLogsTable: jest.fn().mockReturnValueOnce(null),
      doesSourceExist: jest.fn().mockReturnValueOnce(false),
      doesSchemaExist: jest.fn().mockReturnValueOnce(false),
      untrackTables: jest.fn().mockReturnValueOnce(null),
      grantCronAccess: jest.fn().mockResolvedValueOnce(null),
      scheduleLogPartitionJobs: jest.fn().mockResolvedValueOnce(null),
      getDbConnectionParameters: jest.fn().mockReturnValueOnce({}),
    };

    adminPgClient = {
      query: jest.fn().mockReturnValue(null),
    };

    cronPgClient = {
      query: jest.fn().mockReturnValue(null),
    };

    userPgClientQuery = jest.fn().mockReturnValue(null);
    const PgClient = jest.fn().mockImplementation(() => {
      return {
        query: userPgClientQuery,
      };
    });

    provisioner = new Provisioner(hasuraClient, adminPgClient, cronPgClient, undefined, crypto, pgFormat, PgClient as any);

    indexerConfig = new IndexerConfig('', accountId, functionName, 0, '', databaseSchema, LogLevel.INFO);
  });

  describe('isUserApiProvisioned', () => {
    it('returns false if datasource doesnt exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);

      await expect(provisioner.fetchUserApiProvisioningStatus(indexerConfig)).resolves.toBe(false);
      expect(provisioner.isUserApiProvisioned(indexerConfig.accountId, indexerConfig.functionName)).toBe(false);
    });

    it('returns false if datasource and schema dont exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(false);

      await expect(provisioner.fetchUserApiProvisioningStatus(indexerConfig)).resolves.toBe(false);
      expect(provisioner.isUserApiProvisioned(indexerConfig.accountId, indexerConfig.functionName)).toBe(false);
    });

    it('returns true if datasource and schema exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(true);

      await expect(provisioner.fetchUserApiProvisioningStatus(indexerConfig)).resolves.toBe(true);
      expect(provisioner.isUserApiProvisioned(indexerConfig.accountId, indexerConfig.functionName)).toBe(true);
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
        ["SELECT cron.schedule_in_database('morgs_near_test_function_logs_create_partition', '0 1 * * *', $$SELECT morgs_near_test_function.fn_create_partition('morgs_near_test_function.__logs', CURRENT_DATE, '1 day', '2 day')$$, 'morgs_near');"],
        ["SELECT cron.schedule_in_database('morgs_near_test_function_logs_delete_partition', '0 2 * * *', $$SELECT morgs_near_test_function.fn_delete_partition('morgs_near_test_function.__logs', CURRENT_DATE, '-15 day', '-14 day')$$, 'morgs_near');"]
      ]);
      expect(hasuraClient.addDatasource).toBeCalledWith(indexerConfig.userName(), password, indexerConfig.databaseName());
      expect(hasuraClient.createSchema).toBeCalledWith(indexerConfig.userName(), indexerConfig.schemaName());
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(1, indexerConfig.userName(), indexerConfig.schemaName(), metadataDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(2, indexerConfig.userName(), indexerConfig.schemaName(), setProvisioningStatusQuery);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(3, indexerConfig.userName(), indexerConfig.schemaName(), logsDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(4, indexerConfig.userName(), indexerConfig.schemaName(), databaseSchema);
      expect(hasuraClient.getTableNames).toBeCalledWith(indexerConfig.schemaName(), indexerConfig.databaseName());
      expect(hasuraClient.trackTables).toBeCalledWith(indexerConfig.schemaName(), tableNames, indexerConfig.databaseName());
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
      expect(provisioner.isUserApiProvisioned(accountId, functionName)).toBe(true);
    });

    it('skips provisioning the datasource if it already exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);

      await provisioner.provisionUserApi(indexerConfig);

      expect(adminPgClient.query).not.toBeCalled();
      expect(hasuraClient.addDatasource).not.toBeCalled();

      expect(hasuraClient.createSchema).toBeCalledWith(indexerConfig.userName(), indexerConfig.schemaName());
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(1, indexerConfig.userName(), indexerConfig.schemaName(), metadataDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(2, indexerConfig.userName(), indexerConfig.schemaName(), setProvisioningStatusQuery);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(3, indexerConfig.userName(), indexerConfig.schemaName(), logsDDL);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(4, indexerConfig.databaseName(), indexerConfig.schemaName(), databaseSchema);
      expect(hasuraClient.getTableNames).toBeCalledWith(indexerConfig.schemaName(), indexerConfig.databaseName());
      expect(hasuraClient.trackTables).toBeCalledWith(indexerConfig.schemaName(), tableNames, indexerConfig.databaseName());
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

    it('throws an error when it fails to fetch table names', async () => {
      hasuraClient.getTableNames = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to fetch table names: some error');
    });

    it('throws an error when it fails to track tables', async () => {
      hasuraClient.trackTables = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to track tables: some error');
    });

    it('throws an error when it fails to track foreign key relationships', async () => {
      hasuraClient.trackForeignKeyRelationships = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to track foreign key relationships: some error');
    });

    it('throws an error when it fails to add permissions to tables', async () => {
      hasuraClient.addPermissionsToTables = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to add permissions to tables: some error');
    });

    it('throws when grant cron access fails', async () => {
      cronPgClient.query = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to grant cron access: some error');
    });

    it('throws when scheduling cron jobs fails', async () => {
      userPgClientQuery = jest.fn().mockRejectedValueOnce(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to schedule log partition jobs: some error');
    });

    it('throws when scheduling cron jobs fails', async () => {
      userPgClientQuery = jest.fn().mockRejectedValueOnce(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to schedule log partition jobs: some error');
    });

    it('throws when scheduling cron jobs fails', async () => {
      userPgClientQuery = jest.fn().mockRejectedValueOnce(error);

      await expect(provisioner.provisionUserApi(indexerConfig)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to schedule log partition jobs: some error');
    });

    it('provisions logs table once', async () => {
      await provisioner.provisionLogsIfNeeded(indexerConfig);
      await provisioner.provisionLogsIfNeeded(indexerConfig);

      expect(hasuraClient.executeSqlOnSchema).toBeCalledTimes(1);
      expect(cronPgClient.query).toBeCalledTimes(2);
    });

    it('provisions metadata table once', async () => {
      await provisioner.provisionMetadataIfNeeded(indexerConfig);
      await provisioner.provisionMetadataIfNeeded(indexerConfig);

      expect(hasuraClient.executeSqlOnSchema).toBeCalledTimes(2); // Create table and set provisioning status
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

      const params = await mockProvisioner.getPostgresConnectionParameters(indexerConfig);
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

      const params = await mockProvisioner.getPgBouncerConnectionParameters(indexerConfig);
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
