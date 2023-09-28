import { wrapError } from '../utility';
import PgClientModule from '../pg-client';
import HasuraClient from '../hasura-client/hasura-client';

export default class DmlHandler {
  validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  private constructor (
    private readonly pgClient: PgClientModule,
  ) {}

  static async create (
    account: string,
    hasuraClient: HasuraClient = new HasuraClient(),
    PgClient = PgClientModule
  ): Promise<DmlHandler> {
    const connectionParameters = await hasuraClient.getDbConnectionParameters(account);
    const pgClient = new PgClient({
      user: connectionParameters.username,
      password: connectionParameters.password,
      host: process.env.PGHOST,
      port: Number(connectionParameters.port),
      database: connectionParameters.database,
    });

    return new DmlHandler(pgClient);
  }

  async insert (schemaName: string, tableName: string, objects: any[]): Promise<any[]> {
    if (!objects?.length) {
      return [];
    }

    const keys = Object.keys(objects[0]);
    // Get array of values from each object, and return array of arrays as result. Expects all objects to have the same number of items in same order
    const values = objects.map(obj => keys.map(key => obj[key]));
    const query = `INSERT INTO ${schemaName}."${tableName}" (${keys.join(', ')}) VALUES %L RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query, values), []), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    if (result.rows?.length === 0) {
      console.log('No rows were inserted.');
    }
    return result.rows;
  }

  async select (schemaName: string, tableName: string, object: any, limit: number | null = null): Promise<any[]> {
    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    let query = `SELECT * FROM ${schemaName}."${tableName}" WHERE ${param}`;
    if (limit !== null) {
      query = query.concat(' LIMIT ', Math.round(limit).toString());
    }

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), values), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were selected.');
    }
    return result.rows;
  }

  async update (schemaName: string, tableName: string, whereObject: any, updateObject: any): Promise<any[]> {
    const updateKeys = Object.keys(updateObject);
    const updateParam = Array.from({ length: updateKeys.length }, (_, index) => `${updateKeys[index]}=$${index + 1}`).join(', ');
    const whereKeys = Object.keys(whereObject);
    const whereParam = Array.from({ length: whereKeys.length }, (_, index) => `${whereKeys[index]}=$${index + 1 + updateKeys.length}`).join(' AND ');

    const queryValues = [...Object.values(updateObject), ...Object.values(whereObject)];
    const query = `UPDATE ${schemaName}."${tableName}" SET ${updateParam} WHERE ${whereParam} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryValues), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were selected.');
    }
    return result.rows;
  }

  async upsert (schemaName: string, tableName: string, objects: any[], conflictColumns: string[], updateColumns: string[]): Promise<any[]> {
    if (!objects?.length) {
      return [];
    }

    const keys = Object.keys(objects[0]);
    // Get array of values from each object, and return array of arrays as result. Expects all objects to have the same number of items in same order
    const values = objects.map(obj => keys.map(key => obj[key]));
    const updatePlaceholders = updateColumns.map(col => `${col} = excluded.${col}`).join(', ');
    const query = `INSERT INTO ${schemaName}."${tableName}" (${keys.join(', ')}) VALUES %L ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updatePlaceholders} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query, values), []), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    if (result.rows?.length === 0) {
      console.log('No rows were inserted or updated.');
    }
    return result.rows;
  }

  async delete (schemaName: string, tableName: string, object: any): Promise<any[]> {
    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    const query = `DELETE FROM ${schemaName}."${tableName}" WHERE ${param} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), values), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were deleted.');
    }
    return result.rows;
  }
}
