import HasuraClient from './hasura-client';

export default class Provisioner {
    constructor(
        hasuraClient = new HasuraClient(),
    ) {
        this.hasuraClient = hasuraClient;
    }

    doesEndpointExist(schemaName) {
        return this.hasuraClient.isSchemaCreated(schema);
    }

    async createAuthenticatedEndpoint(schemaName, roleName, migration) {
        await this.hasuraClient.createSchema(schemaName);

        await this.hasuraClient.runMigrations(schemaName, migration);

        const tableNames = await this.hasuraClient.getTableNames(schemaName);
        await this.hasuraClient.trackTables(schemaName, tableNames);

        await this.hasuraClient.addPermissionsToTables(
            schemaName,
            tableNames,
            roleName,
            ['select', 'insert', 'update', 'delete']
        );
    }
}
