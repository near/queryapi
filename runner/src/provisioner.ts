import VError from 'verror';
import cryptoModule from 'crypto';
import HasuraClient from './hasura-client';
import PgClient from './pg-client';

const DEFAULT_PASSWORD_LENGTH = 16;

const sharedPgClient = new PgClient({
  user: process.env.PG_ADMIN_USER,
  password: process.env.PG_ADMIN_PASSWORD,
  database: process.env.PG_ADMIN_DATABASE,
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
});

export default class Provisioner {
  constructor (
    private readonly hasuraClient: HasuraClient = new HasuraClient(),
    private readonly pgClient: PgClient = sharedPgClient,
    private readonly crypto: typeof cryptoModule = cryptoModule,
  ) {
    this.hasuraClient = hasuraClient;
    this.pgClient = pgClient;
    this.crypto = crypto;
  }

  generatePassword (length: number = DEFAULT_PASSWORD_LENGTH): string {
    return this.crypto
      .randomBytes(length)
      .toString('base64')
      .slice(0, length)
      .replace(/\+/g, '0')
      .replace(/\//g, '0');
  }

  async createDatabase (name: string): Promise<void> {
    await this.pgClient.query(this.pgClient.format('CREATE DATABASE %I', name));
  }

  async createUser (name: string, password: string): Promise<void> {
    await this.pgClient.query(this.pgClient.format('CREATE USER %I WITH PASSWORD %L', name, password));
  }

  async restrictUserToDatabase (databaseName: string, userName: string): Promise<void> {
    await this.pgClient.query(this.pgClient.format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', databaseName, userName));
    await this.pgClient.query(this.pgClient.format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', databaseName));
  }

  async createUserDb (userName: string, password: string, databaseName: string): Promise<void> {
    await this.wrapError(
      async () => {
        await this.createDatabase(databaseName);
        await this.createUser(userName, password);
        await this.restrictUserToDatabase(databaseName, userName);
      },
      'Failed to create user db'
    );
  }

  async isUserApiProvisioned (accountId: string, functionName: string): Promise<boolean> {
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

  async wrapError<T>(fn: () => Promise<T>, errorMessage: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error) {
        throw new VError(error, errorMessage);
      }
      throw new VError(errorMessage);
    }
  }

  async createSchema (databaseName: string, schemaName: string): Promise<void> {
    return await this.wrapError(async () => await this.hasuraClient.createSchema(databaseName, schemaName), 'Failed to create schema');
  }

  async runMigrations (databaseName: string, schemaName: string, migration: any): Promise<void> {
    return await this.wrapError(async () => await this.hasuraClient.runMigrations(databaseName, schemaName, migration), 'Failed to run migrations');
  }

  async getTableNames (schemaName: string, databaseName: string): Promise<string[]> {
    return await this.wrapError(async () => await this.hasuraClient.getTableNames(schemaName, databaseName), 'Failed to fetch table names');
  }

  async trackTables (schemaName: string, tableNames: string[], databaseName: string): Promise<void> {
    return await this.wrapError(async () => await this.hasuraClient.trackTables(schemaName, tableNames, databaseName), 'Failed to track tables');
  }

  async addPermissionsToTables (schemaName: string, databaseName: string, tableNames: string[], roleName: string, permissions: string[]): Promise<void> {
    return await this.wrapError(async () => await this.hasuraClient.addPermissionsToTables(
      schemaName,
      databaseName,
      tableNames,
      roleName,
      permissions
    ), 'Failed to add permissions to tables');
  }

  async trackForeignKeyRelationships (schemaName: string, databaseName: string): Promise<void> {
    return await this.wrapError(async () => await this.hasuraClient.trackForeignKeyRelationships(schemaName, databaseName), 'Failed to track foreign key relationships');
  }

  async addDatasource (userName: string, password: string, databaseName: string): Promise<void> {
    return await this.wrapError(async () => await this.hasuraClient.addDatasource(userName, password, databaseName), 'Failed to add datasource');
  }

  replaceSpecialChars (str: string): string {
    return str.replaceAll(/[.-]/g, '_');
  }

  async provisionUserApi (accountId: string, functionName: string, databaseSchema: any): Promise<void> { // replace any with actual type
    const sanitizedAccountId = this.replaceSpecialChars(accountId);
    const sanitizedFunctionName = this.replaceSpecialChars(functionName);

    const databaseName = sanitizedAccountId;
    const userName = sanitizedAccountId;
    const schemaName = `${sanitizedAccountId}_${sanitizedFunctionName}`;

    await this.wrapError(
      async () => {
        if (!await this.hasuraClient.doesSourceExist(databaseName)) {
          const password = this.generatePassword();
          await this.createUserDb(userName, password, databaseName);
          await this.addDatasource(userName, password, databaseName);
        }

        // Untrack tables from old schema to prevent conflicts with new DB
        if (await this.hasuraClient.doesSchemaExist(HasuraClient.DEFAULT_DATABASE, schemaName)) {
          const tableNames = await this.getTableNames(schemaName, HasuraClient.DEFAULT_DATABASE);
          await this.hasuraClient.untrackTables(HasuraClient.DEFAULT_DATABASE, schemaName, tableNames);
        }

        await this.createSchema(databaseName, schemaName);
        await this.runMigrations(databaseName, schemaName, databaseSchema);

        const tableNames = await this.getTableNames(schemaName, databaseName);
        await this.trackTables(schemaName, tableNames, databaseName);

        await this.trackForeignKeyRelationships(schemaName, databaseName);

        await this.addPermissionsToTables(schemaName, databaseName, tableNames, userName, ['select', 'insert', 'update', 'delete']);
      },
      'Failed to provision endpoint'
    );
  }
}
