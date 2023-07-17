import VError from "verror";
import pg from "pg";

import HasuraClient from "./hasura-client.js";

const pool = new pg.Pool({
    user: process.env.PG_ADMIN_USER,
    password: process.env.PG_ADMIN_PASSWORD,
    database: process.env.PG_ADMIN_DATABASE,
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    max: 10, 
    idleTimeoutMillis: 30000,
});

export default class Provisioner {
    constructor(
        hasuraClient = new HasuraClient(),
        pgPool = pool
    ) {
        this.hasuraClient = hasuraClient;
        this.pgPool = pgPool;
    }

    async query(query) {
        const client = await this.pgPool.connect();
        try {
            await client.query(query);
        } finally {
            client.release();
        }
    }

    async createDatabase(name) {
        await this.query(`CREATE DATABASE ${name}`);
    }

    async createUser(name, password) {
        await this.query(`CREATE USER ${name} WITH PASSWORD '${password}';`)
    }

    async restrictDatabaseToUser(databaseName, userName) {
        await this.query(`GRANT ALL PRIVILEGES ON DATABASE ${databaseName} TO ${userName};`);
        await this.query(`REVOKE CONNECT ON DATABASE ${databaseName} FROM PUBLIC;`);
    }

    async createUserDb(name, password) {
        const userName = name;
        const databaseName = name;

        await this.createDatabase(databaseName);
        await this.createUser(userName, password);
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

    async provisionUserApi(userName, migration) {
        const databaseName = userName;
        const password = 'password';

        await this.createUserDb(userName, password);
        await this.hasuraClient.addDatasource(userName, password, databaseName);
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
