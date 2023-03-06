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
        await this.hasuraClient.createSchema(schema);

        await this.hasuraClient.runMigrations(schema, migration);

        const tableNames = await this.hasuraClient.getTableNames(schema);
        await this.hasuraClient.trackTables(schema, tableNames);

        await this.hasuraClient.addPermissionsToTables(
            schema,
            tableNames,
            roleName,
            ['select', 'insert', 'update', 'delete']
        );
    }
}
