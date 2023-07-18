import { jest } from '@jest/globals';
import VError from 'verror'

import HasuraClient from './hasura-client';
import Provisioner from './provisioner';

describe('Provisioner', () => {
    let pgPool;
    let pgClient;
    let hasuraClient;

    const tableNames = ['blocks'];
    const accountId = 'morgs.near';
    const sanitizedAccountId = 'morgs_near';
    const functionName = 'test-function';
    const sanitizedFunctionName = 'test_function';
    const databaseSchema = 'CREATE TABLE blocks (height numeric)';
    const error = new Error('some error');

    const password = 'password';
    const crypto = {
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
            trackTables: jest.fn().mockReturnValueOnce(),
            trackForeignKeyRelationships: jest.fn().mockReturnValueOnce(),
            addPermissionsToTables: jest.fn().mockReturnValueOnce(),
            addDatasource: jest.fn().mockReturnValueOnce(),
            runMigrations: jest.fn().mockReturnValueOnce(),
            createSchema: jest.fn().mockReturnValueOnce(),
        };

        pgClient = {
            query: jest.fn().mockResolvedValue(),
            release: jest.fn().mockResolvedValue(),
        };
        pgPool = {
            connect: jest.fn().mockResolvedValue(pgClient)
        };
    });

    it('checks if the endpoint already exists', async () => {
        const provisioner = new Provisioner({
            isSchemaCreated: jest.fn().mockResolvedValueOnce(true)
        });

        expect(await provisioner.doesEndpointExist('schema')).toBe(true);
    });

    it('provisions an API for the user', async () => {
        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

        expect(pgClient.query.mock.calls).toEqual([
            ['CREATE DATABASE morgs_near', []],
            ['CREATE USER morgs_near WITH PASSWORD \'password\'', []],
            ['GRANT ALL PRIVILEGES ON DATABASE morgs_near TO morgs_near', []],
            ['REVOKE CONNECT ON DATABASE morgs_near FROM PUBLIC', []],
        ]);
        expect(hasuraClient.addDatasource).toBeCalledWith(sanitizedAccountId, password, sanitizedAccountId);
        expect(hasuraClient.runMigrations).toBeCalledWith(sanitizedAccountId, sanitizedFunctionName, databaseSchema);
        expect(hasuraClient.getTableNames).toBeCalledWith(sanitizedFunctionName, sanitizedAccountId);
        expect(hasuraClient.trackTables).toBeCalledWith(sanitizedFunctionName, tableNames, sanitizedAccountId);
        expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
            sanitizedFunctionName,
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
        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await provisioner.createUserDb('morgs_near', 'pass; DROP TABLE users;--', 'databaseName UNION SELECT * FROM users --');

        expect(pgClient.query.mock.calls).toMatchSnapshot();
    });

    it('throws an error when it fails to create a postgres db', async () => {
        pgClient.query = jest.fn().mockRejectedValue(error);

        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to create user db: some error');
    });

    it('throws an error when it fails to add the db to hasura', async () => {
        hasuraClient.addDatasource = jest.fn().mockRejectedValue(error);

        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to add datasource: some error');
    });

    it('throws an error when it fails to run migrations', async () => {
        hasuraClient.runMigrations = jest.fn().mockRejectedValue(error);

        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to run migrations: some error');
    });

    it('throws an error when it fails to fetch table names', async () => {
        hasuraClient.getTableNames = jest.fn().mockRejectedValue(error);

        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to fetch table names: some error');
    });

    it('throws an error when it fails to track tables', async () => {
        hasuraClient.trackTables = jest.fn().mockRejectedValue(error);

        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to track tables: some error');
    });

    it('throws an error when it fails to track foreign key relationships', async () => {
        hasuraClient.trackForeignKeyRelationships = jest.fn().mockRejectedValue(error);

        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to track foreign key relationships: some error');
    })

    it('throws an error when it fails to add permissions to tables', async () => {
        hasuraClient.addPermissionsToTables = jest.fn().mockRejectedValue(error);

        const provisioner = new Provisioner(hasuraClient, pgPool, crypto);

        await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to add permissions to tables: some error');
    });
})
