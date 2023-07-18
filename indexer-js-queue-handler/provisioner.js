import VError from "verror";
import pg from "pg";
import cryptoModule from "crypto";
import pgFormatModule from "pg-format";

import HasuraClient from "./hasura-client.js";

const DEFAULT_PASSWORD_LENGTH = 16;

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
        pgPool = pool,
        crypto = cryptoModule,
        pgFormat = pgFormatModule
    ) {
        this.hasuraClient = hasuraClient;
        this.pgPool = pgPool;
        this.crypto = crypto;
        this.pgFormat = pgFormat;
    }

    async query(query, params = []) {
        const client = await this.pgPool.connect();
        try {
            await client.query(query, params);
        } finally {
            client.release();
        }
    }

    generatePassword(length) {
        return this.crypto
            .randomBytes(length)
            .toString('base64')
            .slice(0,length)
            .replace(/\+/g, '0')
            .replace(/\//g, '0');
    }

    async createDatabase(name) {
        await this.query(this.pgFormat('CREATE DATABASE %I', name));
    }

    async createUser(name, password) {
        await this.query(this.pgFormat(`CREATE USER %I WITH PASSWORD '%I'`, name, password))
    }

    async restrictDatabaseToUser(databaseName, userName) {
        await this.query(this.pgFormat('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', databaseName, userName));
        await this.query(this.pgFormat('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', databaseName));
    }

    async createUserDb(name, password) {
        const userName = name;
        const databaseName = name;

        try {
            await this.createDatabase(databaseName);
            await this.createUser(userName, password);
            await this.restrictDatabaseToUser(databaseName, userName);
        } catch (error) {
            throw new VError(error, `Failed to create user db`);
        }
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

    async runMigrations(source, migration) {
        try {
            await this.hasuraClient.runSql(source, migration);
        } catch (error) {
            throw new VError(error, `Failed to run migrations`);
        }
    }

    async getTableNames(schemaName, databaseName) {
        try {
            return await this.hasuraClient.getTableNames(schemaName, databaseName);
        } catch (error) {
            throw new VError(error, `Failed to fetch table names`);
        }
    }

    async trackTables(schemaName, tableNames, databaseName) {
        try {
            await this.hasuraClient.trackTables(schemaName, tableNames, databaseName);
        } catch (error) {
            throw new VError(error, `Failed to track tables`);
        }
    }

    async addPermissionsToTables(schemaName, databaseName, tableNames, roleName, permissions) {
        try {
            await this.hasuraClient.addPermissionsToTables(
                schemaName,
                databaseName,
                tableNames,
                roleName,
                ['select', 'insert', 'update', 'delete']
            );
        } catch (error) {
            throw new VError(error, `Failed to add permissions to tables`);
        }
    }

    async trackForeignKeyRelationships(schemaName, databaseName) {
        try {
            await this.hasuraClient.trackForeignKeyRelationships(schemaName, databaseName);
        } catch (error) {
            throw new VError(error, `Failed to track foreign key relationships`);
        }
    }

    async addDatasource(userName, password, databaseName) {
        try {
            await this.hasuraClient.addDatasource(userName, password, databaseName);
        } catch (error) {
            throw new VError(error, `Failed to add datasource`);
        }
    }

    async provisionUserApi(userName, databaseSchema) {
        const databaseName = userName;
        const defaultSchema = 'public';

        try {
            const password = this.generatePassword(DEFAULT_PASSWORD_LENGTH)
            await this.createUserDb(userName, password);
            await this.addDatasource(userName, password, databaseName);
            await this.runMigrations(databaseName, databaseSchema);

            const tableNames = await this.getTableNames(defaultSchema, databaseName);
            await this.trackTables(defaultSchema, tableNames, databaseName);

            await this.trackForeignKeyRelationships(defaultSchema, databaseName);

            await this.addPermissionsToTables(defaultSchema, databaseName, tableNames, userName, ['select', 'insert', 'update', 'delete']);
        } catch (error) {
            throw new VError(
                {
                    cause: error,
                    info: {
                        schemaName: defaultSchema,
                        userName,
                        databaseSchema,
                        databaseName,
                    }
                },
                `Failed to provision endpoint`
            );
        }
    }
}
