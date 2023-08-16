import { wrapError } from '../utility';
import PgClient from '../pg-client';

const sharedPgClient = new PgClient({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
});

export default class DmlHandler {
  constructor (
    private readonly pgClient: PgClient = sharedPgClient,
  ) {
    this.pgClient = pgClient;
  }

  async insert (account: string, schemaName: string, tableName: string, objects: any[]): Promise<any[]> {
    if (!objects?.length) {
      return [];
    }
    await this.pgClient.setUser(account); // Set Postgres user to account's user

    const keys = Object.keys(objects[0]);
    // Get array of values from each object, and return array of arrays as result. Expects all objects to have the same number of items in same order
    const values = objects.map(obj => keys.map(key => obj[key]));
    const query = `INSERT INTO ${schemaName}.${tableName} (${keys.join(',')}) VALUES %L RETURNING *;`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query, values), []), `Failed to execute '${query}' on ${schemaName}.${tableName}.`);
    if (result.rows?.length === 0) {
      console.log('No rows were inserted.');
    }
    return result.rows;
  }

  async select (account: string, schemaName: string, tableName: string, object: any, limit: number): Promise<any[]> {
    await this.pgClient.setUser(account); // Set Postgres user to account's user

    const roundedLimit = Math.round(limit);
    const keys = Object.keys(object);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');
    let query = `SELECT * FROM ${schemaName}.${tableName} WHERE ${param}`;
    if (roundedLimit > 0) {
      query = query.concat(' LIMIT ', roundedLimit.toString());
    }

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), values), `Failed to execute '${query}' on ${schemaName}.${tableName}.`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were selected.');
    }
    return result.rows;
  }
}
