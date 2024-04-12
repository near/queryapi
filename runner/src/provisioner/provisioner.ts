import { type Tracer, trace } from '@opentelemetry/api';
import pgFormatLib from 'pg-format';

import { wrapError } from '../utility';
import cryptoModule from 'crypto';
import HasuraClient, { type HasuraDatabaseConnectionParameters } from '../hasura-client';
import { logsTableDDL } from './schemas/logs-table';
import { metadataTableDDL } from './schemas/metadata-table';
import PgClientClass, { type PostgresConnectionParams } from '../pg-client';
import type IndexerConfig from '../indexer-config/indexer-config';
import { IndexerStatus, METADATA_TABLE_UPSERT, MetadataFields } from '../indexer-meta/indexer-meta';

const DEFAULT_PASSWORD_LENGTH = 16;

const adminDefaultPgClientGlobal = new PgClientClass({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
});

const adminCronPgClientGlobal = new PgClientClass({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.CRON_DATABASE,
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
});

interface Config {
  cronDatabase: string
  // Override the host/port values returned by Hasura during testing/local development
  pgBouncerHost: string
  pgBouncerPort: number
  postgresHost: string
  postgresPort: number
}

const defaultConfig: Config = {
  cronDatabase: process.env.CRON_DATABASE,
  pgBouncerHost: process.env.PGHOST_PGBOUNCER ?? process.env.PGHOST,
  pgBouncerPort: Number(process.env.PGPORT_PGBOUNCER ?? process.env.PGPORT),
  postgresHost: process.env.PGHOST,
  postgresPort: Number(process.env.PGPORT)
};

export default class Provisioner {
  tracer: Tracer = trace.getTracer('queryapi-runner-provisioner');
  #hasBeenProvisioned: Record<string, Record<string, boolean>> = {};
  #hasLogsBeenProvisioned: Record<string, Record<string, boolean>> = {};
  #hasMetadataBeenProvisioned: Record<string, Record<string, boolean>> = {};

  constructor (
    private readonly hasuraClient: HasuraClient = new HasuraClient(),
    private readonly adminDefaultPgClient: PgClientClass = adminDefaultPgClientGlobal,
    private readonly adminCronPgClient: PgClientClass = adminCronPgClientGlobal,
    private readonly config: Config = defaultConfig,
    private readonly crypto: typeof cryptoModule = cryptoModule,
    private readonly pgFormat: typeof pgFormatLib = pgFormatLib,
    private readonly PgClient: typeof PgClientClass = PgClientClass
  ) {}

  generatePassword (length: number = DEFAULT_PASSWORD_LENGTH): string {
    return this.crypto
      .randomBytes(length)
      .toString('base64')
      .slice(0, length)
      .replace(/\+/g, '0')
      .replace(/\//g, '0');
  }

  isUserApiProvisioned (accountId: string, functionName: string): boolean {
    const accountIndexers = this.#hasBeenProvisioned[accountId];
    if (!accountIndexers) { return false; }
    return accountIndexers[functionName];
  }

  private setProvisioned (accountId: string, functionName: string): void {
    this.#hasBeenProvisioned[accountId] ??= {};
    this.#hasBeenProvisioned[accountId][functionName] = true;
  }

  async createDatabase (name: string): Promise<void> {
    await this.adminDefaultPgClient.query(this.pgFormat('CREATE DATABASE %I', name));
  }

  async createUser (name: string, password: string): Promise<void> {
    await this.adminDefaultPgClient.query(this.pgFormat('CREATE USER %I WITH PASSWORD %L', name, password));
  }

  async restrictUserToDatabase (databaseName: string, userName: string): Promise<void> {
    await this.adminDefaultPgClient.query(this.pgFormat('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', databaseName, userName));
    await this.adminDefaultPgClient.query(this.pgFormat('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', databaseName));
  }

  async grantCronAccess (userName: string): Promise<void> {
    await wrapError(
      async () => {
        await this.adminCronPgClient.query(this.pgFormat('GRANT USAGE ON SCHEMA cron TO %I', userName));
        await this.adminCronPgClient.query(this.pgFormat('GRANT EXECUTE ON FUNCTION cron.schedule_in_database TO %I;', userName));
      },
      'Failed to grant cron access'
    );
  }

  async scheduleLogPartitionJobs (userName: string, databaseName: string, schemaName: string): Promise<void> {
    await wrapError(
      async () => {
        const userDbConnectionParameters = {
          ...(await this.getPostgresConnectionParameters(userName)),
          database: this.config.cronDatabase
        };

        const userCronPgClient = new this.PgClient(userDbConnectionParameters);
        await userCronPgClient.query(
          this.pgFormat(
            "SELECT cron.schedule_in_database('%1$I_logs_create_partition', '0 1 * * *', $$SELECT %1$I.fn_create_partition('%1$I.__logs', CURRENT_DATE, '1 day', '2 day')$$, %2$L);",
            schemaName,
            databaseName
          )
        );
        await userCronPgClient.query(
          this.pgFormat(
            "SELECT cron.schedule_in_database('%1$I_logs_delete_partition', '0 2 * * *', $$SELECT %1$I.fn_delete_partition('%1$I.__logs', CURRENT_DATE, '-15 day', '-14 day')$$, %2$L);",
            schemaName,
            databaseName
          )
        );
      },
      'Failed to schedule log partition jobs'
    );
  }

  async setupPartitionedLogsTable (userName: string, databaseName: string, schemaName: string): Promise<void> {
    await wrapError(
      async () => {
        await this.runLogsSql(databaseName, schemaName);
        await this.grantCronAccess(userName);
        await this.scheduleLogPartitionJobs(userName, databaseName, schemaName);
      },
      'Failed to setup partitioned logs table'
    );
  }

  async createUserDb (userName: string, password: string, databaseName: string): Promise<void> {
    await wrapError(
      async () => {
        await this.createDatabase(databaseName);
        await this.createUser(userName, password);
        await this.restrictUserToDatabase(databaseName, userName);
      },
      'Failed to create user db'
    );
  }

  async fetchUserApiProvisioningStatus (indexerConfig: IndexerConfig): Promise<boolean> {
    const checkProvisioningSpan = this.tracer.startSpan('Check if indexer is provisioned');
    if (this.isUserApiProvisioned(indexerConfig.accountId, indexerConfig.functionName)) {
      checkProvisioningSpan.end();
      return true;
    }

    const databaseName = indexerConfig.databaseName();
    const schemaName = indexerConfig.schemaName();

    const sourceExists = await this.hasuraClient.doesSourceExist(databaseName);
    if (!sourceExists) {
      return false;
    }

    const schemaExists = await this.hasuraClient.doesSchemaExist(databaseName, schemaName);
    if (schemaExists) {
      this.setProvisioned(indexerConfig.accountId, indexerConfig.functionName);
    }
    checkProvisioningSpan.end();
    return schemaExists;
  }

  async createSchema (databaseName: string, schemaName: string): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.createSchema(databaseName, schemaName), 'Failed to create schema');
  }

  async runLogsSql (databaseName: string, schemaName: string): Promise<void> {
    const logsDDL = logsTableDDL(schemaName);
    return await wrapError(async () => await this.hasuraClient.executeSqlOnSchema(databaseName, schemaName, logsDDL), 'Failed to run logs script');
  }

  async createMetadataTable (databaseName: string, schemaName: string): Promise<void> {
    await wrapError(async () => await this.hasuraClient.executeSqlOnSchema(databaseName, schemaName, metadataTableDDL()),
      `Failed to create metadata table in ${databaseName}.${schemaName}`);
  }

  async setProvisioningStatus (userName: string, schemaName: string): Promise<void> {
    await wrapError(async () => {
      const userDbConnectionParameters = await this.getPostgresConnectionParameters(userName);
      const userPgClient = new this.PgClient(userDbConnectionParameters);
      await userPgClient.query(pgFormatLib(METADATA_TABLE_UPSERT, schemaName, [[MetadataFields.STATUS, IndexerStatus.PROVISIONING]]));
    }, 'Failed to set provisioning status on metadata table');
  }

  async runIndexerSql (databaseName: string, schemaName: string, sqlScript: any): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.executeSqlOnSchema(databaseName, schemaName, sqlScript), 'Failed to run user script');
  }

  async getTableNames (schemaName: string, databaseName: string): Promise<string[]> {
    return await wrapError(async () => await this.hasuraClient.getTableNames(schemaName, databaseName), 'Failed to fetch table names');
  }

  async trackTables (schemaName: string, tableNames: string[], databaseName: string): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.trackTables(schemaName, tableNames, databaseName), 'Failed to track tables');
  }

  async addPermissionsToTables (schemaName: string, databaseName: string, tableNames: string[], roleName: string, permissions: string[]): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.addPermissionsToTables(
      schemaName,
      databaseName,
      tableNames,
      roleName,
      permissions
    ), 'Failed to add permissions to tables');
  }

  async trackForeignKeyRelationships (schemaName: string, databaseName: string): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.trackForeignKeyRelationships(schemaName, databaseName), 'Failed to track foreign key relationships');
  }

  async addDatasource (userName: string, password: string, databaseName: string): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.addDatasource(userName, password, databaseName), 'Failed to add datasource');
  }

  replaceSpecialChars (str: string): string {
    return str.replaceAll(/[.-]/g, '_');
  }

  /**
    * Provision logs table for existing Indexers which have already had all
    * other resources provisioned.
    *
    * */
  async provisionLogsIfNeeded (indexerConfig: IndexerConfig): Promise<void> {
    if (this.#hasLogsBeenProvisioned[indexerConfig.accountId]?.[indexerConfig.functionName]) {
      return;
    }
    const logsTable = '__logs';

    await wrapError(
      async () => {
        const tableNames = await this.getTableNames(indexerConfig.schemaName(), indexerConfig.databaseName());

        if (!tableNames.includes(logsTable)) {
          await this.setupPartitionedLogsTable(indexerConfig.userName(), indexerConfig.databaseName(), indexerConfig.schemaName());
        }
        await this.trackTables(indexerConfig.schemaName(), [logsTable], indexerConfig.databaseName());
        await this.addPermissionsToTables(indexerConfig.schemaName(), indexerConfig.databaseName(), [logsTable], indexerConfig.userName(), ['select', 'insert', 'update', 'delete']);
      },
      'Failed standalone logs provisioning'
    );

    this.#hasLogsBeenProvisioned[indexerConfig.accountId] ??= {};
    this.#hasLogsBeenProvisioned[indexerConfig.accountId][indexerConfig.functionName] = true;
  }

  /**
    * Provision metadata table for existing Indexers which have already had all
    * other resources provisioned.
    *
    * */
  async provisionMetadataIfNeeded (indexerConfig: IndexerConfig): Promise<void> {
    if (this.#hasMetadataBeenProvisioned[indexerConfig.accountId]?.[indexerConfig.functionName]) {
      return;
    }
    const metadataTable = '__metadata';

    await wrapError(
      async () => {
        const tableNames = await this.getTableNames(indexerConfig.schemaName(), indexerConfig.databaseName());

        if (!tableNames.includes(metadataTable)) {
          await this.createMetadataTable(indexerConfig.databaseName(), indexerConfig.schemaName());
          await this.setProvisioningStatus(indexerConfig.userName(), indexerConfig.schemaName());
          await this.trackTables(indexerConfig.schemaName(), [metadataTable], indexerConfig.databaseName());
          await this.addPermissionsToTables(indexerConfig.schemaName(), indexerConfig.databaseName(), [metadataTable], indexerConfig.userName(), ['select', 'insert', 'update', 'delete']);
        }
        await this.trackTables(indexerConfig.schemaName(), [metadataTable], indexerConfig.databaseName());
        await this.addPermissionsToTables(indexerConfig.schemaName(), indexerConfig.databaseName(), [metadataTable], indexerConfig.userName(), ['select', 'insert', 'update', 'delete']);
      },
      'Failed standalone metadata provisioning'
    );

    this.#hasMetadataBeenProvisioned[indexerConfig.accountId] ??= {};
    this.#hasMetadataBeenProvisioned[indexerConfig.accountId][indexerConfig.functionName] = true;
  }

  async provisionUserApi (indexerConfig: IndexerConfig): Promise<void> { // replace any with actual type
    const provisioningSpan = this.tracer.startSpan('Provision indexer resources');
    const userName = indexerConfig.userName();
    const databaseName = indexerConfig.databaseName();
    const schemaName = indexerConfig.schemaName();

    try {
      await wrapError(
        async () => {
          if (!await this.hasuraClient.doesSourceExist(databaseName)) {
            const password = this.generatePassword();
            await this.createUserDb(userName, password, databaseName);
            await this.addDatasource(userName, password, databaseName);
          }

          await this.createSchema(databaseName, schemaName);

          await this.createMetadataTable(databaseName, schemaName);
          await this.setProvisioningStatus(userName, schemaName);
          await this.setupPartitionedLogsTable(userName, databaseName, schemaName);
          await this.runIndexerSql(databaseName, schemaName, indexerConfig.schema);

          const updatedTableNames = await this.getTableNames(schemaName, databaseName);

          await this.trackTables(schemaName, updatedTableNames, databaseName);

          await this.trackForeignKeyRelationships(schemaName, databaseName);

          await this.addPermissionsToTables(schemaName, databaseName, updatedTableNames, userName, ['select', 'insert', 'update', 'delete']);
          this.setProvisioned(indexerConfig.accountId, indexerConfig.functionName);
        },
        'Failed to provision endpoint'
      );
    } finally {
      provisioningSpan.end();
    }
  }

  async getPostgresConnectionParameters (userName: string): Promise<PostgresConnectionParams> {
    const userDbConnectionParameters: HasuraDatabaseConnectionParameters = await this.hasuraClient.getDbConnectionParameters(userName);
    return {
      user: userDbConnectionParameters.username,
      password: userDbConnectionParameters.password,
      database: userDbConnectionParameters.database,
      host: this.config.postgresHost,
      port: this.config.postgresPort,
    };
  }

  async getPgBouncerConnectionParameters (userName: string): Promise<PostgresConnectionParams> {
    const userDbConnectionParameters: HasuraDatabaseConnectionParameters = await this.hasuraClient.getDbConnectionParameters(userName);
    return {
      user: userDbConnectionParameters.username,
      password: userDbConnectionParameters.password,
      database: userDbConnectionParameters.database,
      host: this.config.pgBouncerHost,
      port: this.config.pgBouncerPort,
    };
  }
}
