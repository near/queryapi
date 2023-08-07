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

  async insert (schemaName: string, tableName: string, objects: any[]): Promise<any[]> {
    console.log('Inserting object %s into table %s on schema %s', JSON.stringify(objects), tableName, schemaName);
    if (!objects?.length) {
      return [];
    }
    const keys = Object.keys(objects[0]);
    // Get array of values from each object, and return array of arrays as result. Expects all objects to have the same number of items in same order
    const values = objects.map(obj => keys.map(key => obj[key]));

    const query = `INSERT INTO ${schemaName}.${tableName} (${keys.join(',')}) VALUES %L RETURNING *;`;
    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query, values), []), `Failed to execute ${query} on schema ${schemaName}.${tableName}`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were inserted.');
    }
    return result.rows;
  }

  async select (schemaName: string, tableName: string, object: any, limit: number): Promise<any[]> {
    const roundedLimit = Math.round(limit);
    console.log('Selecting objects with values %s from table %s on schema %s with %s limit', JSON.stringify(object), tableName, schemaName, limit === 0 ? 'no' : roundedLimit.toString());
    console.log(object);
    const keys = Object.keys(object);
    console.log(keys);
    const values = Object.values(object);
    const param = Array.from({ length: keys.length }, (_, index) => `${keys[index]}=$${index + 1}`).join(' AND ');

    let query = `SELECT * FROM ${schemaName}.${tableName} WHERE ${param}`;
    if (roundedLimit <= 0) {
      query = query.concat(';');
    } else {
      query = query.concat(' LIMIT ', roundedLimit.toString(), ';');
    }
    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), values), `Failed to execute ${query} on ${schemaName}.${tableName}`);
    if (!(result.rows && result.rows.length > 0)) {
      console.log('No rows were selected.');
    }
    return result.rows;
  }
}
