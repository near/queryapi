import pgFormat from 'pg-format';

import Provisioner from './provisioner';
// import { logsTableDDL } from './schemas/logs-table';
// import { metadataTableDDL } from './schemas/metadata-table';

describe('Provisioner', () => {
  let adminPgClient: any;
  let cronPgClient: any;
  let hasuraClient: any;
  let provisioner: Provisioner;
  let userPgClientQuery: any;

  const tableNames = ['blocks'];
  const accountId = 'morgs.near';
  const sanitizedAccountId = 'morgs_near';
  const functionName = 'test-function';
  const sanitizedFunctionName = 'test_function';
  const databaseSchema = 'CREATE TABLE blocks (height numeric)';
  const logsDDL = expect.any(String);
  const error = new Error('some error');
  const schemaName = `${sanitizedAccountId}_${sanitizedFunctionName}`;

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
  });

  describe('isUserApiProvisioned', () => {
    it('returns false if datasource doesnt exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);

      await expect(provisioner.fetchUserApiProvisioningStatus(accountId, functionName)).resolves.toBe(false);
      expect(provisioner.isUserApiProvisioned(accountId, functionName)).toBe(false);
    });

    it('returns false if datasource and schema dont exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(false);

      await expect(provisioner.fetchUserApiProvisioningStatus(accountId, functionName)).resolves.toBe(false);
      expect(provisioner.isUserApiProvisioned(accountId, functionName)).toBe(false);
    });

    it('returns true if datasource and schema exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(true);

      await expect(provisioner.fetchUserApiProvisioningStatus(accountId, functionName)).resolves.toBe(true);
      expect(provisioner.isUserApiProvisioned(accountId, functionName)).toBe(true);
    });
  });

  describe('provisionUserApi', () => {
    it('provisions an API for the user', async () => {
      await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

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
        ["SELECT cron.schedule_in_database('morgs_near_test_function_logs_create_partition', '0 1 * * *', $$SELECT fn_create_partition('morgs_near_test_function.__logs', CURRENT_DATE, '1 day', '2 day')$$, 'morgs_near');"],
        ["SELECT cron.schedule_in_database('morgs_near_test_function_logs_delete_partition', '0 2 * * *', $$SELECT fn_delete_partition('morgs_near_test_function.__logs', CURRENT_DATE, '-15 day', '-14 day')$$, 'morgs_near');"]
      ]);
      expect(hasuraClient.addDatasource).toBeCalledWith(sanitizedAccountId, password, sanitizedAccountId);
      expect(hasuraClient.createSchema).toBeCalledWith(sanitizedAccountId, schemaName);
      // expect(hasuraClient.executeSqlOnSchema).toBeCalledWith(sanitizedAccountId, schemaName, metadataTableDDL());
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(1, sanitizedAccountId, schemaName, databaseSchema);
      expect(hasuraClient.executeSqlOnSchema).toHaveBeenNthCalledWith(2, sanitizedAccountId, schemaName, logsDDL);
      expect(hasuraClient.getTableNames).toBeCalledWith(schemaName, sanitizedAccountId);
      expect(hasuraClient.trackTables).toBeCalledWith(schemaName, tableNames, sanitizedAccountId);
      expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
        schemaName,
        sanitizedAccountId,
        tableNames,
        sanitizedAccountId,
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

      await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

      expect(adminPgClient.query).not.toBeCalled();
      expect(hasuraClient.addDatasource).not.toBeCalled();

      expect(hasuraClient.createSchema).toBeCalledWith(sanitizedAccountId, schemaName);
      // expect(hasuraClient.executeSqlOnSchema).toBeCalledWith(sanitizedAccountId, schemaName, logsTableDDL(schemaName));
      // expect(hasuraClient.executeSqlOnSchema).toBeCalledWith(sanitizedAccountId, schemaName, metadataTableDDL());
      expect(hasuraClient.executeSqlOnSchema).toBeCalledWith(sanitizedAccountId, schemaName, databaseSchema);
      expect(hasuraClient.getTableNames).toBeCalledWith(schemaName, sanitizedAccountId);
      expect(hasuraClient.trackTables).toBeCalledWith(schemaName, tableNames, sanitizedAccountId);
      expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
        schemaName,
        sanitizedAccountId,
        tableNames,
        sanitizedAccountId,
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

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to create user db: some error');
    });

    it('throws an error when it fails to add the db to hasura', async () => {
      hasuraClient.addDatasource = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to add datasource: some error');
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

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to fetch table names: some error');
    });

    it('throws an error when it fails to track tables', async () => {
      hasuraClient.trackTables = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to track tables: some error');
    });

    it('throws an error when it fails to track foreign key relationships', async () => {
      hasuraClient.trackForeignKeyRelationships = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to track foreign key relationships: some error');
    });

    it('throws an error when it fails to add permissions to tables', async () => {
      hasuraClient.addPermissionsToTables = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to add permissions to tables: some error');
    });

    // TODO re-enable once logs table is created
    it.skip('throws an error when it fails to create logs table', async () => {
      hasuraClient.executeSqlOnSchema = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to run logs script: some error');
    });

    it.skip('throws an error when it fails to create metadata table', async () => {
      hasuraClient.executeSqlOnSchema = jest.fn().mockResolvedValueOnce(null).mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to create metadata table in morgs_near.morgs_near_test_function: some error');
    });

    it('throws an error when it fails to run sql', async () => {
      // hasuraClient.executeSqlOnSchema = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockRejectedValue(error);
      hasuraClient.executeSqlOnSchema = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to run user script: some error');
    });

    it.skip('throws when grant cron access fails', async () => {
      cronPgClient.query = jest.fn().mockRejectedValue(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to grant cron access: some error');
    });

    it('throws when scheduling cron jobs fails', async () => {
      userPgClientQuery = jest.fn().mockRejectedValueOnce(error);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to setup partitioned logs table: Failed to schedule log partition jobs: some error');
    });
  });
});
