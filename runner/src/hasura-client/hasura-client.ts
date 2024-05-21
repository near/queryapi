import fetch, { type Response } from 'node-fetch';
import pluralize from 'pluralize';

interface Dependencies {
  fetch: typeof fetch
}

interface SqlOptions {
  readOnly: boolean
  source?: string
}

export type HasuraPermission = 'select' | 'insert' | 'update' | 'delete';

interface TableDefinition {
  name: string
  schema: string
}
export interface HasuraRolePermission {
  role: string
  permission: {
    check?: Record<string, any>
    columns?: string[]
    backend_only?: boolean
    filter?: Record<string, any>
    allow_aggregations?: boolean
  }
}
export interface HasuraTableMetadata {
  table: TableDefinition
  insert_permissions?: HasuraRolePermission[]
  select_permissions?: HasuraRolePermission[]
  update_permissions?: HasuraRolePermission[]
  delete_permissions?: HasuraRolePermission[]
}

export interface HasuraDatabaseConnectionParameters {
  password: string
  database: string
  username: string
  host: string
  port: number
}

interface HasuraDatabaseUrl {
  connection_parameters: HasuraDatabaseConnectionParameters
}

interface DefaultHasuraDatabaseUrl {
  from_env: string
}

function isDefaultDatabaseUrl (
  object: DefaultHasuraDatabaseUrl | HasuraDatabaseUrl
): object is DefaultHasuraDatabaseUrl {
  return 'from_env' in object;
}

export interface HasuraConfiguration {
  connection_info: {
    database_url: DefaultHasuraDatabaseUrl | HasuraDatabaseUrl
    isolation_level?: string
    pool_settings?: Record<string, any>
    use_prepared_statements?: boolean
  }
}

export interface HasuraSource {
  name: string
  kind: string
  tables: HasuraTableMetadata[]
  configuration: HasuraConfiguration
}

export interface HasuraMetadata {
  version: number
  sources: HasuraSource[]
}

type MetadataRequestArgs = Record<string, any>;

type MetadataRequests = Record<string, any>;

interface Config {
  adminSecret: string
  endpoint: string
  pgHost: string
  pgHostHasura?: string
  pgPortHasura?: string
  pgPort: string
}

const defaultConfig: Config = {
  adminSecret: process.env.HASURA_ADMIN_SECRET,
  endpoint: process.env.HASURA_ENDPOINT,
  pgHost: process.env.PGHOST,
  pgHostHasura: process.env.PGHOST_HASURA,
  pgPortHasura: process.env.PGPORT_HASURA,
  pgPort: process.env.PGPORT,
};

export default class HasuraClient {
  static DEFAULT_DATABASE = 'default';
  static DEFAULT_SCHEMA = 'public';

  private readonly deps: Dependencies;

  constructor (deps?: Partial<Dependencies>, private readonly config: Config = defaultConfig) {
    this.deps = {
      fetch,
      ...deps,
    };
  }

  async executeSql (sql: string, opts: SqlOptions): Promise<any> {
    const response: Response = await this.deps.fetch(
      `${this.config.endpoint}/v2/query`,
      {
        method: 'POST',
        headers: {
          'X-Hasura-Admin-Secret': this.config.adminSecret,
        },
        body: JSON.stringify({
          type: 'run_sql',
          args: {
            sql,
            read_only: opts.readOnly,
            source: opts.source ?? 'default',
          },
        }),
      }
    );

    const body: string = await response.text();

    if (response.status !== 200) {
      throw new Error(body);
    }

    return JSON.parse(body);
  }

  async executeMetadataRequest (
    type: string,
    args: MetadataRequestArgs,
    version?: number
  ): Promise<any> {
    const response: Response = await this.deps.fetch(
      `${this.config.endpoint}/v1/metadata`,
      {
        method: 'POST',
        headers: {
          'X-Hasura-Admin-Secret': this.config.adminSecret,
        },
        body: JSON.stringify({
          type,
          args,
          ...(version && { version }),
        }),
      }
    );

    const body: string = await response.text();

    if (response.status !== 200) {
      throw new Error(body);
    }

    return JSON.parse(body);
  }

  async executeBulkMetadataRequest (
    metadataRequests: MetadataRequests
  ): Promise<any> {
    return await this.executeMetadataRequest('bulk', metadataRequests);
  }

  async exportMetadata (): Promise<HasuraMetadata> {
    const { metadata } = await this.executeMetadataRequest(
      'export_metadata',
      {},
      2
    );
    return metadata;
  }

  async getDbConnectionParameters (account: string): Promise<HasuraDatabaseConnectionParameters> {
    const metadata: HasuraMetadata = await this.exportMetadata();
    const source = metadata.sources.find((source: HasuraSource) => source.name === account);
    if (source === undefined) {
      throw new Error(`Could not find connection parameters for user ${account} on respective database.`);
    } else if (isDefaultDatabaseUrl(source.configuration.connection_info.database_url)) {
      throw new Error('Default connection parameters are not supported.');
    }
    return source.configuration.connection_info.database_url.connection_parameters;
  }

  async doesSourceExist (source: string): Promise<boolean> {
    const metadata = await this.exportMetadata();
    return metadata.sources.filter(({ name }: { name: string }) => name === source).length > 0;
  }

  async doesSchemaExist (source: string, schemaName: string): Promise<boolean> {
    const { result } = await this.executeSql(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${schemaName}'`,
      { source, readOnly: true }
    );

    return result.length > 1;
  }

  async createSchema (source: string, schemaName: string): Promise<any> {
    return await this.executeSql(`CREATE schema ${schemaName}`, {
      source,
      readOnly: false,
    });
  }

  async executeSqlOnSchema (source: string, schemaName: string, sqlScript: string): Promise<any> {
    return await this.executeSql(
      `
      set schema '${schemaName}';
      ${sqlScript}
      `,
      { source, readOnly: false }
    );
  }

  async getTableNames (schemaName: string, source: string): Promise<string[]> {
    const tablesInSource = await this.executeMetadataRequest(
      'pg_get_source_tables',
      {
        source,
      }
    );
    return tablesInSource
      .filter(({ schema }: { schema: string }) => schema === schemaName)
      .map(({ name }: { name: string }) => name);
  }

  async getTrackedTablePermissions (
    databaseName: string,
    schemaName: string,
  ): Promise<HasuraTableMetadata[]> {
    const metadata: HasuraMetadata = await this.exportMetadata();
    const hasuraSource = metadata.sources.find((source: HasuraSource) => source.name === databaseName);
    const tablesForSchema = hasuraSource?.tables.filter((tableMetadata: HasuraTableMetadata) => tableMetadata.table.schema === schemaName);

    return tablesForSchema ?? [];
  }

  async trackTables (
    schemaName: string,
    tableNames: string[],
    source: string
  ): Promise<any> {
    return await this.executeBulkMetadataRequest(
      tableNames.map(name => ({
        type: 'pg_track_table',
        args: {
          source,
          table: {
            name,
            schema: schemaName,
          },
        },
      }))
    );
  }

  async untrackTables (
    source: string,
    schema: string,
    tableNames: string[],
    cascade = true
  ): Promise<any> {
    return await this.executeBulkMetadataRequest(
      tableNames.map(name => ({
        type: 'pg_untrack_table',
        args: {
          table: {
            schema,
            name,
          },
          source,
          cascade,
        },
      }))
    );
  }

  async getForeignKeys (schemaName: string, source: string): Promise<any[]> {
    const { result } = await this.executeSql(
      `
      SELECT
        COALESCE(json_agg(row_to_json(info)), '[]'::JSON)
      FROM (
        SELECT
          q.table_schema::text AS table_schema,
          q.table_name::text AS table_name,
          q.constraint_name::text AS constraint_name,
          min(q.ref_table_table_schema::text) AS ref_table_table_schema,
          min(q.ref_table::text) AS ref_table,
          json_object_agg(ac.attname, afc.attname) AS column_mapping,
          min(q.confupdtype::text) AS on_update,
          min(q.confdeltype::text) AS
          on_delete
        FROM (
          SELECT
            ctn.nspname AS table_schema,
            ct.relname AS table_name,
            r.conrelid AS table_id,
            r.conname AS constraint_name,
            cftn.nspname AS ref_table_table_schema,
            cft.relname AS ref_table,
            r.confrelid AS ref_table_id,
            r.confupdtype,
            r.confdeltype,
            unnest(r.conkey) AS column_id,
            unnest(r.confkey) AS ref_column_id
          FROM
            pg_constraint r
            JOIN pg_class ct ON r.conrelid = ct.oid
            JOIN pg_namespace ctn ON ct.relnamespace = ctn.oid
            JOIN pg_class cft ON r.confrelid = cft.oid
            JOIN pg_namespace cftn ON cft.relnamespace = cftn.oid
          WHERE
            r.contype = 'f'::"char"
            AND ((ctn.nspname='${schemaName}'))
            ) q
          JOIN pg_attribute ac ON q.column_id = ac.attnum
            AND q.table_id = ac.attrelid
          JOIN pg_attribute afc ON q.ref_column_id = afc.attnum
            AND q.ref_table_id = afc.attrelid
          GROUP BY
            q.table_schema,
            q.table_name,
            q.constraint_name) AS info;
      `,
      { readOnly: true, source }
    );

    const [, [foreignKeysJsonString]] = result;

    return JSON.parse(foreignKeysJsonString);
  }

  async trackForeignKeyRelationships (
    schemaName: string,
    source: string
  ): Promise<any> {
    const foreignKeys = await this.getForeignKeys(schemaName, source);

    if (foreignKeys.length === 0) {
      return;
    }

    return await this.executeBulkMetadataRequest(
      foreignKeys
        .map((foreignKey) => ([
          {
            type: 'pg_create_array_relationship',
            args: {
              source,
              name: foreignKey.table_name,
              table: {
                name: foreignKey.ref_table,
                schema: schemaName,
              },
              using: {
                foreign_key_constraint_on: {
                  table: {
                    name: foreignKey.table_name,
                    schema: schemaName,
                  },
                  column: Object.keys(foreignKey.column_mapping)[0],
                }
              },
            }
          },
          {
            type: 'pg_create_object_relationship',
            args: {
              source,
              name: pluralize.singular(foreignKey.ref_table),
              table: {
                name: foreignKey.table_name,
                schema: schemaName,
              },
              using: {
                foreign_key_constraint_on: Object.keys(foreignKey.column_mapping)[0],
              },
            }
          },
        ]))
        .flat()
    );
  }

  async addPermissionsToTables (schemaName: string, source: string, tableNames: string[], roleName: string, permissions: string[]): Promise<any> {
    return await this.executeBulkMetadataRequest(
      tableNames
        .map((tableName) => (
          permissions.map((permission) => ({
            type: `pg_create_${permission}_permission`,
            args: {
              source,
              table: {
                name: tableName,
                schema: schemaName,
              },
              role: roleName,
              permission: {
                columns: '*',
                check: {},
                computed_fields: [],
                filter: {},
                ...(permission !== 'select' && { backend_only: true }),
                ...(permission === 'select' && { allow_aggregations: true })
              },
            },
          }))
        ))
        .flat()
    );
  }

  async addDatasource (userName: string, password: string, databaseName: string): Promise<any> {
    return await this.executeMetadataRequest('pg_add_source', {
      name: databaseName,
      configuration: {
        connection_info: {
          database_url: {
            connection_parameters: {
              password,
              database: databaseName,
              username: userName,
              host: this.config.pgHostHasura ?? this.config.pgHost,
              port: Number(this.config.pgPortHasura ?? this.config.pgPort),
            }
          },
        },
      },
    });
  }
}
