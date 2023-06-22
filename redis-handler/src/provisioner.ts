import VError from "verror";
import HasuraClient from "./hasura-client";

class Provisioner {
  constructor(private hasuraClient: HasuraClient = new HasuraClient()) {
    this.hasuraClient = hasuraClient;
  }

  doesEndpointExist(schemaName: string): Promise<boolean> {
    return this.hasuraClient.isSchemaCreated(schemaName);
  }

  async createSchema(schemaName: string): Promise<void> {
    try {
      await this.hasuraClient.createSchema(schemaName);
    } catch (error: any) {
      throw new VError(error, `Failed to create schema`);
    }
  }

  async runMigrations(schemaName: string, migration: string): Promise<void> {
    try {
      await this.hasuraClient.runMigrations(schemaName, migration);
    } catch (error: any) {
      throw new VError(error, `Failed to run migrations`);
    }
  }

  async getTableNames(schemaName: string): Promise<string[]> {
    try {
      return await this.hasuraClient.getTableNames(schemaName);
    } catch (error: any) {
      throw new VError(error, `Failed to fetch table names`);
    }
  }

  async trackTables(schemaName: string, tableNames: string[]): Promise<void> {
    try {
      await this.hasuraClient.trackTables(schemaName, tableNames);
    } catch (error: any) {
      throw new VError(error, `Failed to track tables`);
    }
  }

  async addPermissionsToTables(
    schemaName: string,
    tableNames: string[],
    roleName: string,
    permissions: string[]
  ): Promise<void> {
    try {
      await this.hasuraClient.addPermissionsToTables(
        schemaName,
        tableNames,
        roleName,
        permissions
      );
    } catch (error: any) {
      throw new VError(error, `Failed to add permissions to tables`);
    }
  }

  async trackForeignKeyRelationships(schemaName: string): Promise<void> {
    try {
      await this.hasuraClient.trackForeignKeyRelationships(schemaName);
    } catch (error: any) {
      throw new VError(error, `Failed to track foreign key relationships`);
    }
  }

  async createAuthenticatedEndpoint(
    schemaName: string,
    roleName: string,
    migration: string
  ): Promise<void> {
    try {
      await this.createSchema(schemaName);

      await this.runMigrations(schemaName, migration);

      const tableNames = await this.getTableNames(schemaName);
      await this.trackTables(schemaName, tableNames);

      await this.trackForeignKeyRelationships(schemaName);

      await this.addPermissionsToTables(schemaName, tableNames, roleName, [
        "select",
        "insert",
        "update",
        "delete",
      ]);
    } catch (error: any) {
      throw new VError(
        {
          cause: error,
          info: {
            schemaName,
            roleName,
            migration,
          },
        },
        `Failed to provision endpoint`
      );
    }
  }
}

export default Provisioner;
