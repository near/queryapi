import { wrapError } from '../utility';
import PgClientModule from '../pg-client';
import HasuraClient from '../hasura-client/hasura-client';

export default class DmlHandler {
  private pgClient!: PgClientModule;
  private readonly initialized: Promise<void>;

  constructor (
    private readonly account: string,
    private readonly hasuraClient: HasuraClient = new HasuraClient(),
    private readonly PgClient = PgClientModule,
  ) {
    this.initialized = this.initialize();
  }

  private async initialize (): Promise<void> {
    const connectionParameters = await this.hasuraClient.getDbConnectionParameters(this.account);
    this.pgClient = new this.PgClient({
      user: connectionParameters.username,
      password: connectionParameters.password,
      host: process.env.PGHOST,
      port: Number(connectionParameters.port),
      database: connectionParameters.database,
    });
  }

  async insert (schemaName: string, tableName: string, objects: any[]): Promise<any[]> {
    await this.initialized; // Ensure constructor completed before proceeding
    if (!objects?.length) {
      return [];
    }

    const keys = Object.keys(objects[0]);
    // Get array of values from each object, and return array of arrays as result. Expects all objects to have the same number of items in same order
    const values = objects.map(obj => keys.map(key => obj[key]));
    const query = `INSERT INTO ${schemaName}.${tableName} (${keys.join(',')}) VALUES %L RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query, values), []), `Failed to execute '${query}' on ${schemaName}.${tableName}.`);
    if (result.rows?.length === 0) {
      console.log('No rows were inserted.');
    }
    return result.rows;
  }

  async select (schemaName: string, tableName: string, object: any, limit: number | null = null): Promise<any[]> {
    await this.initialized; // Ensure constructor completed before proceeding

    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    let query = `SELECT * FROM ${schemaName}.${tableName} WHERE ${param}`;
    if (limit !== null) {
      query = query.concat(' LIMIT ', Math.round(limit).toString());
    }

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), values), `Failed to execute '${query}' on ${schemaName}.${tableName}.`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were selected.');
    }
    return result.rows;
  }

  async update (schemaName: string, tableName: string, whereObject: any, updateObject: any): Promise<any[]> {
    await this.initialized; // Ensure constructor completed before proceeding

    const updateKeys = Object.keys(updateObject);
    const updateParam = Array.from({ length: updateKeys.length }, (_, index) => `${updateKeys[index]}=$${index + 1}`).join(', ');
    const whereKeys = Object.keys(whereObject);
    const whereParam = Array.from({ length: whereKeys.length }, (_, index) => `${whereKeys[index]}=$${index + 1 + updateKeys.length}`).join(' AND ');

    const queryValues = [...Object.values(updateObject), ...Object.values(whereObject)];
    const query = `UPDATE ${schemaName}.${tableName} SET ${updateParam} WHERE ${whereParam} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryValues), `Failed to execute '${query}' on ${schemaName}.${tableName}.`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were selected.');
    }
    return result.rows;
  }
}
