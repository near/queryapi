import { jest } from '@jest/globals';
import VError from 'verror'

import HasuraClient from './hasura-client';
import Provisioner from './provisioner';

describe('Provision', () => {
    it('checks if the endpoint already exists', async () => {
        const provisioner = new Provisioner({
            isSchemaCreated: jest.fn().mockResolvedValueOnce(true)
        });

        expect(await provisioner.doesEndpointExist('schema')).toBe(true);
    });

    it('creates an authenticated endpoint', async () => {
        const tableNames = ['blocks'];
        const hasuraClient = {
            runMigrations: jest.fn().mockReturnValueOnce(),
            getTableNames: jest.fn().mockReturnValueOnce(tableNames),
            trackTables: jest.fn().mockReturnValueOnce(),
            trackForeignKeyRelationships: jest.fn().mockReturnValueOnce(),
            addPermissionsToTables: jest.fn().mockReturnValueOnce(),
        };
        const provisioner = new Provisioner(hasuraClient);

        const schemaName = 'schema';
        const roleName = 'role';
        const migration = 'CREATE TABLE blocks (height numeric)';
        await provisioner.createAuthenticatedEndpoint(schemaName, roleName, migration);

        expect(hasuraClient.runMigrations).toBeCalledWith(schemaName, migration);
        expect(hasuraClient.getTableNames).toBeCalledWith(schemaName);
        expect(hasuraClient.trackTables).toBeCalledWith(schemaName, tableNames);
        expect(hasuraClient.addPermissionsToTables).toBeCalledWith(
            schemaName,
            tableNames,
            roleName,
            [
                'select',
                'insert',
                'update',
                'delete'
            ]
        );
    });

    it('throws an error when it fails to run migrations', async () => {
        const error = new Error('some http error');
        const hasuraClient = {
            createSchema: jest.fn().mockReturnValueOnce(),
            runMigrations: jest.fn().mockRejectedValue(error),
        };
        const provisioner = new Provisioner(hasuraClient);

        try {
            await provisioner.createAuthenticatedEndpoint('name', 'role', 'CREATE TABLE blocks (height numeric)')
        } catch (error) {
            expect(error.message).toBe('Failed to provision endpoint: Failed to run migrations: some http error');
            expect(VError.info(error)).toEqual({
                schemaName: 'name',
                roleName: 'role',
                migration: 'CREATE TABLE blocks (height numeric)',
            });
        }
    });

    it('throws an error when it fails to fetch table names', async () => {
        const error = new Error('some http error');
        const hasuraClient = {
            createSchema: jest.fn().mockReturnValueOnce(),
            runMigrations: jest.fn().mockReturnValueOnce(),
            getTableNames: jest.fn().mockRejectedValue(error),
        };
        const provisioner = new Provisioner(hasuraClient);

        try {
            await provisioner.createAuthenticatedEndpoint('name', 'role', 'CREATE TABLE blocks (height numeric)')
        } catch (error) {
            expect(error.message).toBe('Failed to provision endpoint: Failed to fetch table names: some http error');
            expect(VError.info(error)).toEqual({
                schemaName: 'name',
                roleName: 'role',
                migration: 'CREATE TABLE blocks (height numeric)',
            });
        }
    });

    it('throws an error when it fails to track tables', async () => {
        const error = new Error('some http error');
        const tableNames = ['blocks'];
        const hasuraClient = {
            createSchema: jest.fn().mockReturnValueOnce(),
            runMigrations: jest.fn().mockReturnValueOnce(),
            getTableNames: jest.fn().mockReturnValueOnce(tableNames),
            trackTables: jest.fn().mockRejectedValueOnce(error),
        };
        const provisioner = new Provisioner(hasuraClient);

        try {
            await provisioner.createAuthenticatedEndpoint('name', 'role', 'CREATE TABLE blocks (height numeric)')
        } catch (error) {
            expect(error.message).toBe('Failed to provision endpoint: Failed to track tables: some http error');
            expect(VError.info(error)).toEqual({
                schemaName: 'name',
                roleName: 'role',
                migration: 'CREATE TABLE blocks (height numeric)',
            });
        }
    });

    it('throws an error when it fails to track foreign key relationships', async () => {
        const error = new Error('some http error');
        const tableNames = ['blocks'];
        const hasuraClient = {
            createSchema: jest.fn().mockReturnValueOnce(),
            runMigrations: jest.fn().mockReturnValueOnce(),
            getTableNames: jest.fn().mockReturnValueOnce(tableNames),
            trackTables: jest.fn().mockReturnValueOnce(),
            trackForeignKeyRelationships: jest.fn().mockRejectedValueOnce(error),
        };
        const provisioner = new Provisioner(hasuraClient);

        try {
            await provisioner.createAuthenticatedEndpoint('name', 'role', 'CREATE TABLE blocks (height numeric)')
        } catch (error) {
            expect(error.message).toBe('Failed to provision endpoint: Failed to track foreign key relationships: some http error');
            expect(VError.info(error)).toEqual({
                schemaName: 'name',
                roleName: 'role',
                migration: 'CREATE TABLE blocks (height numeric)',
            });
        }
    })

    it('throws an error when it fails to add permissions to tables', async () => {
        const error = new Error('some http error');
        const tableNames = ['blocks'];
        const hasuraClient = {
            createSchema: jest.fn().mockReturnValueOnce(),
            runMigrations: jest.fn().mockReturnValueOnce(),
            getTableNames: jest.fn().mockReturnValueOnce(tableNames),
            trackTables: jest.fn().mockReturnValueOnce(),
            trackForeignKeyRelationships: jest.fn().mockReturnValueOnce(),
            addPermissionsToTables: jest.fn().mockRejectedValue(error),
        };
        const provisioner = new Provisioner(hasuraClient);

        try {
            await provisioner.createAuthenticatedEndpoint('name', 'role', 'CREATE TABLE blocks (height numeric)')
        } catch (error) {
            expect(error.message).toBe('Failed to provision endpoint: Failed to add permissions to tables: some http error');
            expect(VError.info(error)).toEqual({
                migration: 'CREATE TABLE blocks (height numeric)',
                schemaName: 'name',
                roleName: 'role',
            });
        }
    });
})
