import VError from "verror";
import PG from "pg";

import HasuraClient from "./hasura-client.js";

export default class Provisioner {
    constructor(
        hasuraClient = new HasuraClient(),
        pgClient = new PG.Client({
            user: process.env.PG_ADMIN_USER,
            password: process.env.PG_ADMIN_PASSWORD,
            database: process.env.PG_ADMIN_DATABASE,
            host: process.env.PG_HOST,
            port: process.env.PG_PORT,
        })
    ) {
        this.hasuraClient = hasuraClient;
        this.pgConnection = pgClient.connect();
        this.pgClient = pgClient;
    }

    async createDatabase(name) {
        await this.pgConnection;
        await this.pgClient.query(`CREATE DATABASE ${name}`);
    }

    async createUser(name, password) {
        await this.pgConnection;
        await this.pgClient.query(`CREATE USER ${name} WITH PASSWORD '${password}';`)
    }

    async restrictDatabaseToUser(databaseName, userName) {
        await this.pgConnection;
        await this.pgClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${databaseName} TO ${userName};`);
        await this.pgClient.query(`REVOKE CONNECT ON DATABASE ${databaseName} FROM PUBLIC;`);
    }

    async createUserDb(name, password) {
        const userName = `${name}_user`;
        const databaseName = `${name}_db`;

        await this.createDatabase(databaseName);
        await this.createUser(userName, userName);
        await this.restrictDatabaseToUser(databaseName, userName);
    }

    doesEndpointExist(schemaName) {
        return this.hasuraClient.isSchemaCreated(schemaName);
    }

    async createSchema(schemaName) {
        try {
            await this.hasuraClient.createSchema(schemaName);
        } catch (error) {
            throw new VError(error, `Failed to create schema`);
        }
    }

    async runMigrations(schemaName, migration) {
        try {
            await this.hasuraClient.runMigrations(schemaName, migration);
        } catch (error) {
            throw new VError(error, `Failed to run migrations`);
        }
    }

    async getTableNames(schemaName) {
        try {
            return await this.hasuraClient.getTableNames(schemaName);
        } catch (error) {
            throw new VError(error, `Failed to fetch table names`);
        }
    }

    async trackTables(schemaName, tableNames) {
        try {
            await this.hasuraClient.trackTables(schemaName, tableNames);
        } catch (error) {
            throw new VError(error, `Failed to track tables`);
        }
    }

    async addPermissionsToTables(schemaName, tableNames, roleName, permissions) {
        try {
            await this.hasuraClient.addPermissionsToTables(
                schemaName,
                tableNames,
                roleName,
                ['select', 'insert', 'update', 'delete']
            );
        } catch (error) {
            throw new VError(error, `Failed to add permissions to tables`);
        }
    }

    async trackForeignKeyRelationships(schemaName) {
        try {
            await this.hasuraClient.trackForeignKeyRelationships(schemaName);
        } catch (error) {
            throw new VError(error, `Failed to track foreign key relationships`);
        }
    }

    async createAuthenticatedEndpoint(schemaName, roleName, migration) {
        try {
            await this.createSchema(schemaName);

            await this.runMigrations(schemaName, migration);

            const tableNames = await this.getTableNames(schemaName);
            await this.trackTables(schemaName, tableNames);

            await this.trackForeignKeyRelationships(schemaName);

            await this.addPermissionsToTables(schemaName, tableNames, roleName, ['select', 'insert', 'update', 'delete']);
        } catch (error) {
            throw new VError(
                {
                    cause: error,
                    info: {
                        schemaName,
                        roleName,
                        migration,
                    }
                },
                `Failed to provision endpoint`
            );
        }
    }
}
