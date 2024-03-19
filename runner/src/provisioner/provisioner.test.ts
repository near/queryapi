import pgFormat from 'pg-format';

import Provisioner from './provisioner';

describe('Provisioner', () => {
  let pgClient: any;
  let hasuraClient: any;

  const tableNames = ['blocks'];
  const accountId = 'morgs.near';
  const sanitizedAccountId = 'morgs_near';
  const functionName = 'test-function';
  const sanitizedFunctionName = 'test_function';
  const databaseSchema = 'CREATE TABLE blocks (height numeric)';
  const error = new Error('some error');
  const defaultDatabase = 'default';
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
      runMigrations: jest.fn().mockReturnValueOnce(null),
      createSchema: jest.fn().mockReturnValueOnce(null),
      doesSourceExist: jest.fn().mockReturnValueOnce(false),
      doesSchemaExist: jest.fn().mockReturnValueOnce(false),
      untrackTables: jest.fn().mockReturnValueOnce(null),
    };

    pgClient = {
      query: jest.fn().mockReturnValue(null),
      format: pgFormat,
    };
  });

  describe('isUserApiProvisioned', () => {
    it('returns false if datasource doesnt exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.fetchUserApiProvisioningStatus(accountId, functionName)).resolves.toBe(false);
      expect(provisioner.isUserApiProvisioned(accountId, functionName)).toBe(false);
    });

    it('returns false if datasource and schema dont exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(false);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.fetchUserApiProvisioningStatus(accountId, functionName)).resolves.toBe(false);
      expect(provisioner.isUserApiProvisioned(accountId, functionName)).toBe(false);
    });

    it('returns true if datasource and schema exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(true);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.fetchUserApiProvisioningStatus(accountId, functionName)).resolves.toBe(true);
      expect(provisioner.isUserApiProvisioned(accountId, functionName)).toBe(true);
    });
  });

  describe('provisionUserApi', () => {
    it('provisions an API for the user', async () => {
      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

      expect(pgClient.query.mock.calls).toEqual([
        ['CREATE DATABASE morgs_near'],
        ['CREATE USER morgs_near WITH PASSWORD \'password\''],
        ['GRANT ALL PRIVILEGES ON DATABASE morgs_near TO morgs_near'],
        ['REVOKE CONNECT ON DATABASE morgs_near FROM PUBLIC'],
      ]);
      expect(hasuraClient.addDatasource).toBeCalledWith(sanitizedAccountId, password, sanitizedAccountId);
      expect(hasuraClient.createSchema).toBeCalledWith(sanitizedAccountId, schemaName);
      expect(hasuraClient.runMigrations).toBeCalledWith(sanitizedAccountId, schemaName, databaseSchema);
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

    it('untracks tables from the previous schema if they exists', async () => {
      hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(true);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

      expect(hasuraClient.getTableNames).toBeCalledWith(schemaName, defaultDatabase);
      expect(hasuraClient.untrackTables).toBeCalledWith(defaultDatabase, schemaName, tableNames);
    });

    it('skips provisioning the datasource if it already exists', async () => {
      hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

      expect(pgClient.query).not.toBeCalled();
      expect(hasuraClient.addDatasource).not.toBeCalled();

      expect(hasuraClient.createSchema).toBeCalledWith(sanitizedAccountId, schemaName);
      expect(hasuraClient.runMigrations).toBeCalledWith(sanitizedAccountId, schemaName, databaseSchema);
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
      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await provisioner.createUserDb('morgs_near', 'pass; DROP TABLE users;--', 'databaseName UNION SELECT * FROM users --');

      expect(pgClient.query.mock.calls).toMatchSnapshot();
    });

    it('throws an error when it fails to create a postgres db', async () => {
      pgClient.query = jest.fn().mockRejectedValue(error);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to create user db: some error');
    });

    it('throws an error when it fails to add the db to hasura', async () => {
      hasuraClient.addDatasource = jest.fn().mockRejectedValue(error);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to add datasource: some error');
    });

    it('throws an error when it fails to run migrations', async () => {
      hasuraClient.runMigrations = jest.fn().mockRejectedValue(error);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to run migrations: some error');
    });

    it('throws an error when it fails to fetch table names', async () => {
      hasuraClient.getTableNames = jest.fn().mockRejectedValue(error);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to fetch table names: some error');
    });

    it('throws an error when it fails to track tables', async () => {
      hasuraClient.trackTables = jest.fn().mockRejectedValue(error);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to track tables: some error');
    });

    it('throws an error when it fails to track foreign key relationships', async () => {
      hasuraClient.trackForeignKeyRelationships = jest.fn().mockRejectedValue(error);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to track foreign key relationships: some error');
    });

    it('throws an error when it fails to add permissions to tables', async () => {
      hasuraClient.addPermissionsToTables = jest.fn().mockRejectedValue(error);

      const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

      await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to add permissions to tables: some error');
    });
  });
});
