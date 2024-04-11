import { wrapError } from '../utility';
import PgClient from '../pg-client';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';
import { type TableDefinitionNames } from '../indexer';

type WhereClauseMulti = Record<string, (string | number | Array<string | number>)>;
type WhereClauseSingle = Record<string, (string | number)>;

export default class DmlHandler {
  validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  pgClient: PgClient;

  constructor (
    databaseConnectionParameters: DatabaseConnectionParameters,
    pgClientInstance: PgClient | undefined = undefined,
  ) {
    // console.log('ENV', process.env.PGHOST, process.env.PGPORT);
    console.log('DBCONN', {
      user: databaseConnectionParameters.username,
      password: databaseConnectionParameters.password,
      host: databaseConnectionParameters.host,
      port: databaseConnectionParameters.port,
      database: databaseConnectionParameters.database,
    });
    this.pgClient = pgClientInstance ?? new PgClient({
      user: databaseConnectionParameters.username,
      password: databaseConnectionParameters.password,
      host: databaseConnectionParameters.host,
      port: databaseConnectionParameters.port,
      database: databaseConnectionParameters.database,
    });
  }

  private getWhereClause (whereObject: WhereClauseMulti, columnLookup: Map<string, string>): { queryVars: Array<string | number>, whereClause: string } {
    const columns = Object.keys(whereObject);
    const queryVars: Array<string | number> = [];
    const whereClause = columns.map((colName) => {
      const originalColName = columnLookup.get(colName) ?? colName;
      const colCondition = whereObject[colName];
      if (colCondition instanceof Array) {
        const inVals: Array<string | number> = colCondition;
        const inStr = Array.from({ length: inVals.length }, (_, idx) => `$${queryVars.length + idx + 1}`).join(',');
        queryVars.push(...inVals);
        return `${originalColName} IN (${inStr})`;
      } else {
        queryVars.push(colCondition);
        return `${originalColName}=$${queryVars.length}`;
      }
    }).join(' AND ');
    return { queryVars, whereClause };
  }

  async insert (schemaName: string, tableDefinitionNames: TableDefinitionNames, rowsToInsert: any[]): Promise<any[]> {
    if (!rowsToInsert?.length) {
      return [];
    }

    const columnNames = Object.keys(rowsToInsert[0]);
    const originalColumnNames = columnNames.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const rowValues = rowsToInsert.map(row => columnNames.map(col => row[col]));
    const query = `INSERT INTO ${schemaName}.${tableDefinitionNames.originalTableName} (${originalColumnNames.join(', ')}) VALUES %L RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query, rowValues), []), `Failed to execute '${query}' on ${schemaName}.${tableDefinitionNames.originalTableName}.`);
    return result.rows;
  }

  async select (schemaName: string, tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti, limit: number | null = null): Promise<any[]> {
    const { queryVars, whereClause } = this.getWhereClause(whereObject, tableDefinitionNames.originalColumnNames);
    let query = `SELECT * FROM ${schemaName}.${tableDefinitionNames.originalTableName} WHERE ${whereClause}`;
    if (limit !== null) {
      query = query.concat(' LIMIT ', Math.round(limit).toString());
    }

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryVars), `Failed to execute '${query}' on ${schemaName}.${tableDefinitionNames.originalTableName}.`);
    return result.rows;
  }

  async update (schemaName: string, tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseSingle, updateObject: any): Promise<any[]> {
    const updateKeys = Object.keys(updateObject).map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const updateParam = Array.from({ length: updateKeys.length }, (_, index) => `${updateKeys[index]}=$${index + 1}`).join(', ');
    const whereKeys = Object.keys(whereObject).map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const whereParam = Array.from({ length: whereKeys.length }, (_, index) => `${whereKeys[index]}=$${index + 1 + updateKeys.length}`).join(' AND ');

    const queryValues = [...Object.values(updateObject), ...Object.values(whereObject)];
    const query = `UPDATE ${schemaName}.${tableDefinitionNames.originalTableName} SET ${updateParam} WHERE ${whereParam} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryValues), `Failed to execute '${query}' on ${schemaName}.${tableDefinitionNames.originalTableName}.`);
    return result.rows;
  }

  async upsert (schemaName: string, tableDefinitionNames: TableDefinitionNames, rowsToUpsert: any[], conflictColumns: string[], updateColumns: string[]): Promise<any[]> {
    if (!rowsToUpsert?.length) {
      return [];
    }
    conflictColumns = conflictColumns.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    updateColumns = updateColumns.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);

    const columns = Object.keys(rowsToUpsert[0]);
    const originalColumns = columns.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const rowValues = rowsToUpsert.map(row => columns.map(col => row[col]));
    const updatePlaceholders = updateColumns.map(col => `${col} = excluded.${col}`).join(', ');
    const query = `INSERT INTO ${schemaName}.${tableDefinitionNames.originalTableName} (${originalColumns.join(', ')}) VALUES %L ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updatePlaceholders} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query, rowValues), []), `Failed to execute '${query}' on ${schemaName}.${tableDefinitionNames.originalTableName}.`);
    return result.rows;
  }

  async delete (schemaName: string, tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti): Promise<any[]> {
    const { queryVars, whereClause } = this.getWhereClause(whereObject, tableDefinitionNames.originalColumnNames);
    const query = `DELETE FROM ${schemaName}.${tableDefinitionNames.originalTableName} WHERE ${whereClause} RETURNING *`;

    const result = await wrapError(async () => await this.pgClient.query(this.pgClient.format(query), queryVars), `Failed to execute '${query}' on ${schemaName}.${tableDefinitionNames.originalTableName}.`);
    return result.rows;
  }
}
