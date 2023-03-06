import { jest } from '@jest/globals';

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
            createSchema: jest.fn().mockReturnValueOnce(),
            runMigrations: jest.fn().mockReturnValueOnce(),
            getTableNames: jest.fn().mockReturnValueOnce(tableNames),
            trackTables: jest.fn().mockReturnValueOnce(),
            addPermissionsToTables: jest.fn().mockReturnValueOnce(),
        };
        const provisioner = new Provisioner(hasuraClient);

        const schemaName = 'schema';
        const roleName = 'role';
        const migration = 'CREATE TABLE blocks (height numeric)';
        await provisioner.createAuthenticatedEndpoint(schemaName, roleName, migration);

        expect(hasuraClient.createSchema).toBeCalledWith(schemaName);
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
})
