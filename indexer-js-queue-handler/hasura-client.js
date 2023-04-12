import fetch from 'node-fetch';

export default class HasuraClient {
  constructor(
    deps
  ) {
    this.deps = {
        fetch,
        ...deps,
    };
  }

  async executeSql(sql, opts) {
    const response = await this.deps.fetch(`${process.env.HASURA_ENDPOINT}/v2/query`, {
      method: 'POST',
      headers: {
        'X-Hasura-Admin-Secret': process.env.HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({
        type: 'run_sql',
        args: {
          sql,
          read_only: opts.readOnly,
          source: 'default',
        }
      }),
    });

    const body = await response.json();

    if (response.status !== 200) {
      throw new Error(JSON.stringify(body, null, 2));
    }

    return body
  };

  async executeMetadataRequest (type, args) {
    const response = await this.deps.fetch(`${process.env.HASURA_ENDPOINT}/v1/metadata`, {
      method: 'POST',
      headers: {
        'X-Hasura-Admin-Secret': process.env.HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({
        type,
        args,
      }),
    });

    const body = await response.json();

    if (response.status !== 200) {
      throw new Error(JSON.stringify(body, null, 2));
    }

    return body;
  };

  async executeBulkMetadataRequest (metadataRequests) {
    return this.executeMetadataRequest('bulk', metadataRequests);
  } 

  async isSchemaCreated (schemaName) {
    const { result } = await this.executeSql(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${schemaName}'`,
      { readOnly: true }
    );

    return result.length > 1;
  };

  createSchema (schemaName) {
    return this.executeSql(
      `CREATE schema ${schemaName}`,
      { readOnly: false }
    );
  }

  runMigrations(schemaName, migration) {
    return this.executeSql(
      `
      set schema '${schemaName}';
      ${migration}
      `,
      { readOnly: false }
    ); 
  }

  async getTableNames(schemaName) {
    const { result } = await this.executeSql(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schemaName}'`,
      { readOnly: true }
    );
    const [_columnNames, ...tableNames] = result;
    return tableNames.flat();
  };

  async trackTables(schemaName, tableNames) {
    return this.executeBulkMetadataRequest(
      tableNames.map((name) => ({
        type: 'pg_track_table',
        args: {
          table: {
            name,
            schema: schemaName,
          },
        }
      }))
    );
  } 

  async getForeignKeys(schemaName) {
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
      { readOnly: true }
    );

    const [_, [foreignKeysJsonString]] = result;

    return JSON.parse(foreignKeysJsonString);
  }

  async trackForeignKeyRelationships(schemaName) {
    const foreignKeys = await this.getForeignKeys(schemaName);

    return this.executeBulkMetadataRequest(
      foreignKeys
        .map((foreignKey) => ([ 
          {
            type: "pg_create_array_relationship",
            args: {
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
            type: "pg_create_object_relationship",
            args: {
              name: foreignKey.ref_table,
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

  async addPermissionsToTables(schemaName, tableNames, roleName, permissions) {
    return this.executeBulkMetadataRequest(
      tableNames
        .map((tableName) => (
          permissions.map((permission) => ({
            type: `pg_create_${permission}_permission`,
            args: {
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
                ...(permission == 'select' && { allow_aggregations: true })
              },
              source: 'default'
            },
          }))
        ))
        .flat()
    );
  }
}
