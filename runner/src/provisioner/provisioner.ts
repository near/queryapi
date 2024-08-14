import { type Tracer, trace } from '@opentelemetry/api';
import pgFormatLib from 'pg-format';

import { wrapError, wrapSpan } from '../utility';
import cryptoModule from 'crypto';
import HasuraClient, {
  type HasuraDatabaseConnectionParameters,
} from './hasura-client';
import { logsTableDDL } from './schemas/logs-table';
import { metadataTableDDL } from './schemas/metadata-table';
import PgClientClass, { type PostgresConnectionParams } from '../pg-client';
import { type ProvisioningConfig } from '../indexer-config/indexer-config';
import IndexerMetaClass, { METADATA_TABLE_UPSERT, MetadataFields, IndexerStatus, LogEntry } from '../indexer-meta';
import logger from '../logger';
import ProvisioningState from './provisioning-state/provisioning-state';

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

interface RetryConfig {
  maxRetries: number
  baseDelay: number
}

const defaultConfig: Config = {
  cronDatabase: process.env.CRON_DATABASE,
  pgBouncerHost: process.env.PGHOST_PGBOUNCER ?? process.env.PGHOST,
  pgBouncerPort: Number(process.env.PGPORT_PGBOUNCER ?? process.env.PGPORT),
  postgresHost: process.env.PGHOST,
  postgresPort: Number(process.env.PGPORT)
};

const defaultRetryConfig: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000
};

export const METADATA_TABLE_NAME = 'sys_metadata';
export const LOGS_TABLE_NAME = 'sys_logs';

export default class Provisioner {
  tracer: Tracer = trace.getTracer('queryapi-runner-provisioner');

  private readonly SYSTEM_TABLES = [METADATA_TABLE_NAME, LOGS_TABLE_NAME];
  private readonly logger: typeof logger;

  constructor (
    private readonly hasuraClient: HasuraClient = new HasuraClient(),
    private readonly adminDefaultPgClient: PgClientClass = adminDefaultPgClientGlobal,
    private readonly adminCronPgClient: PgClientClass = adminCronPgClientGlobal,
    private readonly config: Config = defaultConfig,
    private readonly crypto: typeof cryptoModule = cryptoModule,
    private readonly pgFormat: typeof pgFormatLib = pgFormatLib,
    private readonly PgClient: typeof PgClientClass = PgClientClass,
    private readonly retryConfig: RetryConfig = defaultRetryConfig,
    private readonly IndexerMeta: typeof IndexerMetaClass = IndexerMetaClass
  ) {
    this.logger = logger.child({ service: 'Provisioner' });
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
            "SELECT cron.schedule_in_database('%1$I_sys_logs_create_partition', '0 1 * * *', $$SELECT %1$I.fn_create_partition('%1$I.sys_logs', CURRENT_DATE, '1 day', '2 day')$$, %2$L);",
            schemaName,
            databaseName
          )
        );
        await userCronPgClient.query(
          this.pgFormat(
            "SELECT cron.schedule_in_database('%1$I_sys_logs_delete_partition', '0 2 * * *', $$SELECT %1$I.fn_delete_partition('%1$I.sys_logs', CURRENT_DATE, '-15 day', '-14 day')$$, %2$L);",
            schemaName,
            databaseName
          )
        );

        await userCronPgClient.end();
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

  async isProvisioned (indexerConfig: ProvisioningConfig): Promise<boolean> {
    const checkProvisioningSpan = this.tracer.startSpan('Check if indexer is provisioned');

    const databaseName = indexerConfig.databaseName();
    const schemaName = indexerConfig.schemaName();

    const sourceExists = await this.hasuraClient.doesSourceExist(databaseName);
    if (!sourceExists) {
      return false;
    }

    const schemaExists = await this.hasuraClient.doesSchemaExist(databaseName, schemaName);

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

      await userPgClient.end();
    }, 'Failed to set provisioning status on metadata table');
  }

  async runIndexerSql (databaseName: string, schemaName: string, sqlScript: any): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.executeSqlOnSchema(databaseName, schemaName, sqlScript), 'Failed to run user script');
  }

  async trackTables (schemaName: string, tableNames: string[], databaseName: string): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.trackTables(schemaName, tableNames, databaseName), 'Failed to track tables');
  }

  async addPermissionsToTables (indexerSchema: ProvisioningConfig, tableNames: string[], permissions: string[]): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.addPermissionsToTables(
      indexerSchema.schemaName(),
      indexerSchema.databaseName(),
      tableNames,
      indexerSchema.hasuraRoleName(),
      permissions
    ), 'Failed to add permissions to tables');
  }

  async trackForeignKeyRelationships (schemaName: string, databaseName: string): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.trackForeignKeyRelationships(schemaName, databaseName), 'Failed to track foreign key relationships');
  }

  async addDatasource (userName: string, password: string, databaseName: string): Promise<void> {
    return await wrapError(async () => await this.hasuraClient.addDatasource(userName, password, databaseName), 'Failed to add datasource');
  }

  async dropSchemaAndMetadata (databaseName: string, schemaName: string): Promise<void> {
    await wrapError(async () => {
      // Need to drop via Hasura to ensure metadata is cleaned up
      await this.hasuraClient.dropSchema(databaseName, schemaName);
    }, 'Failed to drop schema');
  }

  async removeLogPartitionJobs (userName: string, schemaName: string): Promise<void> {
    await wrapError(
      async () => {
        const userCronConnectionParameters = {
          ...(await this.getPostgresConnectionParameters(userName)),
          database: this.config.cronDatabase
        };
        const userCronPgClient = new this.PgClient(userCronConnectionParameters);

        await userCronPgClient.query(
          this.pgFormat(
            "SELECT cron.unschedule('%I_sys_logs_create_partition');",
            schemaName,
          )
        );
        await userCronPgClient.query(
          this.pgFormat(
            "SELECT cron.unschedule('%I_sys_logs_delete_partition');",
            schemaName,
          )
        );

        await userCronPgClient.end();
      },
      'Failed to unschedule log partition jobs'
    );
  }

  async listUserOwnedSchemas (userName: string): Promise<string[]> {
    return await wrapError(async () => {
      const userDbConnectionParameters = await this.getPostgresConnectionParameters(userName);
      const userPgClient = new this.PgClient(userDbConnectionParameters);

      const result = await userPgClient.query(
        this.pgFormat('SELECT schema_name FROM information_schema.schemata WHERE schema_owner = %L', userName)
      );

      await userPgClient.end();

      return result.rows.map((row) => row.schema_name);
    }, 'Failed to list schemas');
  }

  async dropDatabase (databaseName: string): Promise<void> {
    await wrapError(async () => {
      await this.adminDefaultPgClient.query(this.pgFormat('DROP DATABASE IF EXISTS %I (FORCE)', databaseName));
    }, 'Failed to drop database');
  }

  async dropDatasource (databaseName: string): Promise<void> {
    await wrapError(async () => {
      await this.hasuraClient.dropDatasource(databaseName);
    }, 'Failed to drop datasource');
  }

  async dropRole (userName: string): Promise<void> {
    await wrapError(async () => {
      await this.adminDefaultPgClient.query(this.pgFormat('DROP ROLE IF EXISTS %I', userName));
    }, 'Failed to drop role');
  }

  async revokeCronAccess (userName: string): Promise<void> {
    await wrapError(
      async () => {
        await this.adminCronPgClient.query(this.pgFormat('REVOKE USAGE ON SCHEMA cron FROM %I CASCADE', userName));
        await this.adminCronPgClient.query(this.pgFormat('REVOKE EXECUTE ON FUNCTION cron.schedule_in_database FROM %I;', userName));
      },
      'Failed to revoke cron access'
    );
  }

  public async deprovision (config: ProvisioningConfig): Promise<void> {
    await wrapError(async () => {
      await this.dropSchemaAndMetadata(config.userName(), config.schemaName());
      await this.removeLogPartitionJobs(config.userName(), config.schemaName());

      const schemas = await this.listUserOwnedSchemas(config.userName());

      if (schemas.length === 0) {
        await this.dropDatasource(config.databaseName());
        await this.dropDatabase(config.databaseName());
        await this.revokeCronAccess(config.userName());
        await this.dropRole(config.userName());
      }
    }, 'Failed to deprovision');
  }

  async provisionUserApi (indexerConfig: ProvisioningConfig): Promise<void> {
    const logger = this.logger.child({ accountId: indexerConfig.accountId, functionName: indexerConfig.functionName });

    await wrapSpan(async () => {
      await wrapError(async () => {
        let provisioningState: ProvisioningState;
        try {
          provisioningState = await ProvisioningState.loadProvisioningState(this.hasuraClient, indexerConfig);
        } catch (error) {
          logger.error('Failed to get current state of indexer resources', error);
          throw error;
        }
        try {
          await this.provisionSystemResources(indexerConfig, provisioningState);
        } catch (error) {
          logger.error('Failed to provision system resources', error);
          throw error;
        }

        try {
          await this.provisionUserResources(indexerConfig, provisioningState);
        } catch (err) {
          const error = err as Error;

          try {
            await this.writeFailureToUserLogs(indexerConfig, error);
          } catch (error) {
            logger.error('Failed to log provisioning failure', error);
          }

          logger.warn('Failed to provision user resources', error);
          throw error;
        }
      }, 'Failed to provision endpoint');
    }, this.tracer, 'provision indexer resources');
  }

  async writeFailureToUserLogs (indexerConfig: ProvisioningConfig, error: Error): Promise<void> {
    const indexerMeta = new this.IndexerMeta(indexerConfig, await this.getPostgresConnectionParameters(indexerConfig.userName()));
    await indexerMeta.writeLogs([LogEntry.systemError(error.message)]);
  }

  async provisionSystemResources (indexerConfig: ProvisioningConfig, provisioningState: ProvisioningState): Promise<void> {
    const userName = indexerConfig.userName();
    const databaseName = indexerConfig.databaseName();
    const schemaName = indexerConfig.schemaName();

    if (!provisioningState.doesSourceExist()) {
      const password = this.generatePassword();
      await this.createUserDb(userName, password, databaseName);
      await this.addDatasource(userName, password, databaseName);
    } else {
      logger.info('Source already exists');
    }

    if (!provisioningState.doesSchemaExist()) {
      await this.createSchema(databaseName, schemaName);
    } else {
      logger.info('Schema already exists');
    }

    const createdTables = provisioningState.getCreatedTables();

    if (!createdTables.includes(METADATA_TABLE_NAME)) {
      await this.createMetadataTable(databaseName, schemaName);
    } else {
      logger.info('Metadata table already exists');
    }
    await this.setProvisioningStatus(userName, schemaName);

    if (!createdTables.includes(LOGS_TABLE_NAME)) {
      await this.setupPartitionedLogsTable(userName, databaseName, schemaName);
    } else {
      logger.info('Logs table already exists');
    }

    const tablesToTrack = this.SYSTEM_TABLES.filter(systemTable => !provisioningState.getTrackedTables().includes(systemTable));
    if (tablesToTrack.length > 0) {
      await this.trackTables(schemaName, tablesToTrack, databaseName);
    } else {
      logger.info('All system tables are already tracked');
    }

    const tablesToAddPermissions = this.SYSTEM_TABLES.filter(systemTable => !provisioningState.getTablesWithPermissions().includes(systemTable));
    if (tablesToAddPermissions.length > 0) {
      await this.exponentialRetry(async () => {
        await this.addPermissionsToTables(indexerConfig, tablesToAddPermissions, ['select', 'insert', 'update', 'delete']);
      });
    } else {
      logger.info('All system tables already have permissions');
    }
  }

  async provisionUserResources (indexerConfig: ProvisioningConfig, provisioningState: ProvisioningState): Promise<void> {
    const databaseName = indexerConfig.databaseName();
    const schemaName = indexerConfig.schemaName();

    const onlySystemTablesCreated = provisioningState.getCreatedTables().every((table) => this.SYSTEM_TABLES.includes(table));
    if (onlySystemTablesCreated) {
      await this.runIndexerSql(databaseName, schemaName, indexerConfig.schema);
    } else {
      logger.info('Skipping user script execution as non system tables have already been created');
    }

    await provisioningState.reload(this.hasuraClient);
    const userTableNames = provisioningState.getCreatedTables().filter((tableName) => !provisioningState.getTrackedTables().includes(tableName));

    if (userTableNames.length > 0) {
      await this.trackTables(schemaName, userTableNames, databaseName);
    } else {
      logger.info('No user tables to track');
    }

    // Safely retryable
    await this.exponentialRetry(async () => {
      await this.trackForeignKeyRelationships(schemaName, databaseName);
    });

    const tablesWithoutPermissions = userTableNames.filter((tableName) => !provisioningState.getTablesWithPermissions().includes(tableName));
    if (tablesWithoutPermissions.length > 0) {
      await this.exponentialRetry(async () => {
        await this.addPermissionsToTables(indexerConfig, userTableNames, ['select', 'insert', 'update', 'delete']);
      });
    } else {
      logger.info('All user tables already have permissions');
    }
  }

  async exponentialRetry (fn: () => Promise<void>): Promise<void> {
    let lastError = null;
    for (let i = 0; i < this.retryConfig.maxRetries; i++) {
      try {
        await fn();
        return;
      } catch (e) {
        lastError = e;
        await new Promise((resolve) => setTimeout(resolve, this.retryConfig.baseDelay * (2 ** i)));
      }
    }
    throw lastError;
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
