import VError from "verror";
import cryptoModule from "crypto";

import HasuraClient from "./hasura-client.js";
import PgClient from './pg-client.js'

const DEFAULT_PASSWORD_LENGTH = 16;

const sharedPgClient = new PgClient({
    user: process.env.PG_ADMIN_USER,
    password: process.env.PG_ADMIN_PASSWORD,
    database: process.env.PG_ADMIN_DATABASE,
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
});

export default class Provisioner {
    constructor(
        hasuraClient = new HasuraClient(),
        pgClient = sharedPgClient,
        crypto = cryptoModule,
    ) {
        this.hasuraClient = hasuraClient;
        this.pgClient = pgClient;
        this.crypto = crypto;
    }

    generatePassword(length = DEFAULT_PASSWORD_LENGTH) {
        return this.crypto
            .randomBytes(length)
            .toString('base64')
            .slice(0,length)
            .replace(/\+/g, '0')
            .replace(/\//g, '0');
    }

    async createDatabase(name) {
        await this.pgClient.query(this.pgClient.format('CREATE DATABASE %I', name));
    }

    async createUser(name, password) {
        await this.pgClient.query(this.pgClient.format(`CREATE USER %I WITH PASSWORD %L`, name, password))
    }

    async restrictUserToDatabase(databaseName, userName) {
        await this.pgClient.query(this.pgClient.format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', databaseName, userName));
        await this.pgClient.query(this.pgClient.format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', databaseName));
    }

    async createUserDb(userName, password, databaseName) {
        try {
            await this.createDatabase(databaseName);
            await this.createUser(userName, password);
            await this.restrictUserToDatabase(databaseName, userName);
        } catch (error) {
            throw new VError(error, `Failed to create user db`);
        }
    }

    async isUserApiProvisioned(accountId, functionName) {
        const sanitizedAccountId = this.replaceSpecialChars(accountId);
        const sanitizedFunctionName = this.replaceSpecialChars(functionName);

        const databaseName = sanitizedAccountId;
        const schemaName = `${sanitizedAccountId}_${sanitizedFunctionName}`;

        const sourceExists = await this.hasuraClient.doesSourceExist(databaseName);
        if (!sourceExists) {
            return false;
        }

        const schemaExists = await this.hasuraClient.doesSchemaExist(databaseName, schemaName);

        return schemaExists;
    }

    async createSchema(databaseName, schemaName) {
        try {
            await this.hasuraClient.createSchema(databaseName, schemaName);
        } catch (error) {
            throw new VError(error, `Failed to create schema`);
        }
    }

    async runMigrations(databaseName, schemaName, migration) {
        try {
            await this.hasuraClient.runMigrations(databaseName, schemaName, migration);
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
                permissions
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

    replaceSpecialChars(str) {
        return str.replaceAll(/[.-]/g, '_')
    }

    async provisionUserApi(accountId, functionName, databaseSchema) {
        const sanitizedAccountId = this.replaceSpecialChars(accountId);
        const sanitizedFunctionName = this.replaceSpecialChars(functionName);

        const databaseName = sanitizedAccountId;
        const userName = sanitizedAccountId;
        const schemaName = sanitizedFunctionName;

        try {
            if (!await this.hasuraClient.doesSourceExist(databaseName)) {
                const password = this.generatePassword()
                await this.createUserDb(userName, password, databaseName);
                await this.addDatasource(userName, password, databaseName);
            }

            // Untrack tables from old schema to prevent conflicts with new DB
            const oldSchemaName = `${sanitizedAccountId}_${sanitizedFunctionName}`;
            if (await this.hasuraClient.doesSchemaExist(HasuraClient.DEFAULT_DATABASE, oldSchemaName)) {
                const tableNames = await this.getTableNames(oldSchemaName, HasuraClient.DEFAULT_DATABASE);
                await this.hasuraClient.untrackTables(HasuraClient.DEFAULT_DATABASE, oldSchemaName, tableNames);
            }

            await this.createSchema(databaseName, schemaName);
            await this.runMigrations(databaseName, schemaName, databaseSchema);

            const tableNames = await this.getTableNames(schemaName, databaseName);
            await this.trackTables(schemaName, tableNames, databaseName);

            await this.trackForeignKeyRelationships(schemaName, databaseName);

            await this.addPermissionsToTables(schemaName, databaseName, tableNames, userName, ['select', 'insert', 'update', 'delete']);
        } catch (error) {
            throw new VError(
                {
                    cause: error,
                    info: {
                        schemaName,
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
