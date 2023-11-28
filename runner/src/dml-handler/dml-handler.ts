import { wrapError } from '../utility';
import PgClientModule from '../pg-client';
import HasuraClient from '../hasura-client/hasura-client';

export default class DmlHandler {
  validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  private constructor (
    private readonly pgClient: PgClientModule,
    private connected: boolean = false,
    private failedQuery: boolean = false,
  ) {}

  static async create (
    account: string,
    hasuraClient: HasuraClient = new HasuraClient(),
    PgClient = PgClientModule,
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

    const result = await this.makeQuery(schemaName, tableName, query, values, true);
    if (result.length === 0) {
      console.log('No rows were inserted.');
    }
    return result;
  }

  async select (schemaName: string, tableName: string, object: any, limit: number | null = null): Promise<any[]> {
    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    let query = `SELECT * FROM ${schemaName}."${tableName}" WHERE ${param}`;
    if (limit !== null) {
      query = query.concat(' LIMIT ', Math.round(limit).toString());
    }

    const result = await this.makeQuery(schemaName, tableName, query, values, false);
    if (result.length === 0) {
      console.log('No rows were selected.');
    }
    return result;
  }

  async update (schemaName: string, tableName: string, whereObject: any, updateObject: any): Promise<any[]> {
    const updateKeys = Object.keys(updateObject);
    const updateParam = Array.from({ length: updateKeys.length }, (_, index) => `${updateKeys[index]}=$${index + 1}`).join(', ');
    const whereKeys = Object.keys(whereObject);
    const whereParam = Array.from({ length: whereKeys.length }, (_, index) => `${whereKeys[index]}=$${index + 1 + updateKeys.length}`).join(' AND ');

    const queryValues = [...Object.values(updateObject), ...Object.values(whereObject)];
    const query = `UPDATE ${schemaName}."${tableName}" SET ${updateParam} WHERE ${whereParam} RETURNING *`;

    const result = await this.makeQuery(schemaName, tableName, query, queryValues, false);
    if (result.length === 0) {
      console.log('No rows were updated.');
    }
    return result;
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

    const result = await this.makeQuery(schemaName, tableName, query, values, true);
    if (result.length === 0) {
      console.log('No rows were inserted or updated.');
    }
    return result;
  }

  async delete (schemaName: string, tableName: string, object: any): Promise<any[]> {
    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    const query = `DELETE FROM ${schemaName}."${tableName}" WHERE ${param} RETURNING *`;

    const result = await this.makeQuery(schemaName, tableName, query, values, false);
    if (result.length === 0) {
      console.log('No rows were deleted.');
    }
    return result;
  }

  private async makeQuery (schemaName: string, tableName: string, query: string, values: unknown[], formatValues: boolean): Promise<any[]> {
    try {
      await this.startConnection();
      const formattedQuery = formatValues ? this.pgClient.format(query, values) : this.pgClient.format(query);
      const queryValues = formatValues ? [] : values;
      const result = await wrapError(async () => await this.pgClient.query(formattedQuery, queryValues), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
      return result.rows;
    } catch (error) {
      this.failedQuery = true;
      throw error;
    }
  }

  async startConnection (): Promise<void> {
    if (!this.connected) {
      await this.pgClient.startConnection();
      this.connected = true;
    }
  }

  async endConnection (): Promise<void> {
    if (this.connected) {
      await this.pgClient.endConnection(this.failedQuery);
    }
    this.connected = false;
    this.failedQuery = false;
  }
}
