import { jest } from '@jest/globals';
import VError from 'verror';
import pgFormat from 'pg-format';

import HasuraClient from './hasura-client';
import Provisioner from './provisioner';

describe('Provisioner', () => {
    let pgClient;
    let hasuraClient;

    const tableNames = ['blocks'];
    const accountId = 'morgs.near';
    const sanitizedAccountId = 'morgs_near';
    const functionName = 'test-function';
    const sanitizedFunctionName = 'test_function';
    const databaseSchema = 'CREATE TABLE blocks (height numeric)';
    const error = new Error('some error');
    const defaultDatabase = 'default';
    const oldSchemaName = `${sanitizedAccountId}_${sanitizedFunctionName}`;

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
            doesSourceExist: jest.fn().mockReturnValueOnce(false),
            doesSchemaExist: jest.fn().mockReturnValueOnce(false),
            untrackTables: jest.fn().mockReturnValueOnce(),
        };

        pgClient = {
            query: jest.fn().mockResolvedValue(),
            format: pgFormat,
        };
    });

    describe('isUserApiProvisioned', () => {
        it('returns false if datasource doesnt exists', async () => {
            hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);

            const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

            await expect(provisioner.isUserApiProvisioned(accountId, functionName)).resolves.toBe(false);
        });

        it('returns false if datasource and schema dont exists', async () => {
            hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(false);
            hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(false);

            const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

            await expect(provisioner.isUserApiProvisioned(accountId, functionName)).resolves.toBe(false);
        });

        it('returns true if datasource and schema exists', async () => {
            hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);
            hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(true);

            const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

            await expect(provisioner.isUserApiProvisioned(accountId, functionName)).resolves.toBe(true);
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
            expect(hasuraClient.createSchema).toBeCalledWith(sanitizedAccountId, sanitizedFunctionName);
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

        it('untracks tables from the previous schema if they exists', async () => {
            hasuraClient.doesSchemaExist = jest.fn().mockReturnValueOnce(true);

            const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

            await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

            expect(hasuraClient.getTableNames).toBeCalledWith(oldSchemaName, defaultDatabase)
            expect(hasuraClient.untrackTables).toBeCalledWith(defaultDatabase, oldSchemaName, tableNames);
        });

        it('skips provisioning the datasource if it already exists', async () => {
            hasuraClient.doesSourceExist = jest.fn().mockReturnValueOnce(true);

            const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

            await provisioner.provisionUserApi(accountId, functionName, databaseSchema);

            expect(pgClient.query).not.toBeCalled();
            expect(hasuraClient.addDatasource).not.toBeCalled();

            expect(hasuraClient.createSchema).toBeCalledWith(sanitizedAccountId, sanitizedFunctionName);
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
        })

        it('throws an error when it fails to add permissions to tables', async () => {
            hasuraClient.addPermissionsToTables = jest.fn().mockRejectedValue(error);

            const provisioner = new Provisioner(hasuraClient, pgClient, crypto);

            await expect(provisioner.provisionUserApi(accountId, functionName, databaseSchema)).rejects.toThrow('Failed to provision endpoint: Failed to add permissions to tables: some error');
        });
    });
})
