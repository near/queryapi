import { wrapError } from '../utility';
import PgClientModule from '../pg-client';
import HasuraClient from '../hasura-client/hasura-client';

export default class DmlHandler {
  validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  getPgClientPromise: Promise<PgClientModule> | null = null;
  initializeFailure = false;

  private constructor (
    private readonly account: string,
    private readonly hasuraClient: HasuraClient,
    private readonly PgClient: typeof PgClientModule
  ) {}

  static createLazy (
    account: string,
    hasuraClient: HasuraClient = new HasuraClient(),
    PgClient = PgClientModule
  ): DmlHandler {
    return new DmlHandler(account, hasuraClient, PgClient);
  }

  async initialize (): Promise<PgClientModule> {
    if (!this.getPgClientPromise) {
      this.getPgClientPromise = this.getPgClient();
    }
    try {
      return await this.getPgClientPromise;
    } catch (e) {
      this.initializeFailure = true;
      throw e;
    }
  }

  async getPgClient (): Promise<PgClientModule> {
    const connectionParameters = await this.hasuraClient.getDbConnectionParameters(this.account);
    const pgClient = new this.PgClient({
      user: connectionParameters.username,
      password: connectionParameters.password,
      host: process.env.PGHOST,
      port: Number(connectionParameters.port),
      database: connectionParameters.database,
    });

    return pgClient;
  }

  async insert (schemaName: string, tableName: string, objects: any[]): Promise<any[]> {
    const pgClient = await this.initialize();
    if (!objects?.length) {
      return [];
    }

    const keys = Object.keys(objects[0]);
    // Get array of values from each object, and return array of arrays as result. Expects all objects to have the same number of items in same order
    const values = objects.map(obj => keys.map(key => obj[key]));
    const query = `INSERT INTO ${schemaName}."${tableName}" (${keys.join(', ')}) VALUES %L RETURNING *`;

    const result = await wrapError(async () => await pgClient.query(pgClient.format(query, values), []), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    return result.rows;
  }

  async select (schemaName: string, tableName: string, object: any, limit: number | null = null): Promise<any[]> {
    const pgClient = await this.initialize();

    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    let query = `SELECT * FROM ${schemaName}."${tableName}" WHERE ${param}`;
    if (limit !== null) {
      query = query.concat(' LIMIT ', Math.round(limit).toString());
    }

    const result = await wrapError(async () => await pgClient.query(pgClient.format(query), values), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    return result.rows;
  }

  async update (schemaName: string, tableName: string, whereObject: any, updateObject: any): Promise<any[]> {
    const pgClient = await this.initialize();

    const updateKeys = Object.keys(updateObject);
    const updateParam = Array.from({ length: updateKeys.length }, (_, index) => `${updateKeys[index]}=$${index + 1}`).join(', ');
    const whereKeys = Object.keys(whereObject);
    const whereParam = Array.from({ length: whereKeys.length }, (_, index) => `${whereKeys[index]}=$${index + 1 + updateKeys.length}`).join(' AND ');

    const queryValues = [...Object.values(updateObject), ...Object.values(whereObject)];
    const query = `UPDATE ${schemaName}."${tableName}" SET ${updateParam} WHERE ${whereParam} RETURNING *`;

    const result = await wrapError(async () => await pgClient.query(pgClient.format(query), queryValues), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    return result.rows;
  }

  async upsert (schemaName: string, tableName: string, objects: any[], conflictColumns: string[], updateColumns: string[]): Promise<any[]> {
    const pgClient = await this.initialize();
    if (!objects?.length) {
      return [];
    }

    const keys = Object.keys(objects[0]);
    // Get array of values from each object, and return array of arrays as result. Expects all objects to have the same number of items in same order
    const values = objects.map(obj => keys.map(key => obj[key]));
    const updatePlaceholders = updateColumns.map(col => `${col} = excluded.${col}`).join(', ');
    const query = `INSERT INTO ${schemaName}."${tableName}" (${keys.join(', ')}) VALUES %L ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updatePlaceholders} RETURNING *`;

    const result = await wrapError(async () => await pgClient.query(pgClient.format(query, values), []), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    return result.rows;
  }

  async delete (schemaName: string, tableName: string, object: any): Promise<any[]> {
    const pgClient = await this.initialize();

    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    const query = `DELETE FROM ${schemaName}."${tableName}" WHERE ${param} RETURNING *`;

    const result = await wrapError(async () => await pgClient.query(pgClient.format(query), values), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    return result.rows;
  }
}
