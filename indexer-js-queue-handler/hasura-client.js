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
                // allow_aggregations: true
              },
              source: 'default'
            },
          }))
        ))
        .flat()
    );
  }
}
