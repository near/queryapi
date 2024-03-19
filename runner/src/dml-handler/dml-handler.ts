import { wrapError } from '../utility';
import PgClient from '../pg-client';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';

type WhereClauseMulti = Record<string, (string | number | Array<string | number>)>;
type WhereClauseSingle = Record<string, (string | number)>;

export default class DmlHandler {
  validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  private constructor (
    private readonly pgClient: PgClient
  ) {}

  static create (
    databaseConnectionParameters: DatabaseConnectionParameters,
    pgClientInstance: PgClient | undefined = undefined
  ): DmlHandler {
    const pgClient = pgClientInstance ?? new PgClient({
      user: databaseConnectionParameters.username,
      password: databaseConnectionParameters.password,
      host: process.env.PGHOST,
      port: Number(databaseConnectionParameters.port),
      database: databaseConnectionParameters.database,
    });
    return new DmlHandler(pgClient);
  }

  private getWhereClause(whereObject: WhereClauseMulti) {
    const columns = Object.keys(whereObject);
    const queryVars: Array<string | number> = [];
    const whereClause = columns.map((colName) => {
      const colCondition = whereObject[colName];
      if (colCondition instanceof Array) {
        const inVals: Array<string | number> = colCondition;
        const inStr = Array.from({length: inVals.length}, (_, idx) => `$${queryVars.length + idx + 1}`).join(',');
        queryVars.push(...inVals);
        return `${colName} IN (${inStr})`;
      } else {
        queryVars.push(colCondition);
        return `${colName}=$${queryVars.length}`;
      }
    }).join(' AND ');
    return {queryVars, whereClause};
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
    return result.rows;
  }

  async select (schemaName: string, tableName: string, whereObject: WhereClauseMulti, limit: number | null = null): Promise<any[]> {
    const {queryVars, whereClause} = this.getWhereClause(whereObject);
    let query = `SELECT * FROM ${schemaName}."${tableName}" WHERE ${whereClause}`;
    if (limit !== null) {
      query = query.concat(' LIMIT ', Math.round(limit).toString());
    }

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryVars), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    return result.rows;
  }

  async update (schemaName: string, tableName: string, whereObject: WhereClauseSingle, updateObject: any): Promise<any[]> {
    const updateKeys = Object.keys(updateObject);
    const updateParam = Array.from({ length: updateKeys.length }, (_, index) => `${updateKeys[index]}=$${index + 1}`).join(', ');
    const whereKeys = Object.keys(whereObject);
    const whereParam = Array.from({ length: whereKeys.length }, (_, index) => `${whereKeys[index]}=$${index + 1 + updateKeys.length}`).join(' AND ');

    const queryValues = [...Object.values(updateObject), ...Object.values(whereObject)];
    const query = `UPDATE ${schemaName}."${tableName}" SET ${updateParam} WHERE ${whereParam} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryValues), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
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
    return result.rows;
  }

  async delete (schemaName: string, tableName: string, whereObject: WhereClauseMulti): Promise<any[]> {
    const {queryVars, whereClause} = this.getWhereClause(whereObject);
    const query = `DELETE FROM ${schemaName}."${tableName}" WHERE ${whereClause} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryVars), `Failed to execute '${query}' on ${schemaName}."${tableName}".`);
    return result.rows;
  }
}
