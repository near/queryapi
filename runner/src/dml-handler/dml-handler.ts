import { wrapError } from '../utility';
import PgClient, { type PostgresConnectionParams } from '../pg-client';
import { type TableDefinitionNames } from '../indexer';
import type IndexerConfig from '../indexer-config/indexer-config';

import { type Tracer, trace, type Span } from '@opentelemetry/api';
import { type QueryResult } from 'pg';

export type PostgresRowValue = string | number | any;
export type PostgresRow = Record<string, PostgresRowValue>;
export type WhereClauseMulti = Record<string, (PostgresRowValue | PostgresRowValue[])>;
export type WhereClauseSingle = Record<string, PostgresRowValue>;

export interface DmlHandlerInterface {
  insert: (tableDefinitionNames: TableDefinitionNames, rowsToInsert: PostgresRow[]) => Promise<PostgresRow[]>
  select: (tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti, limit: number | null) => Promise<PostgresRow[]>
  update: (tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseSingle, updateObject: any) => Promise<PostgresRow[]>
  upsert: (tableDefinitionNames: TableDefinitionNames, rowsToUpsert: PostgresRow[], conflictColumns: string[], updateColumns: string[]) => Promise<PostgresRow[]>
  delete: (tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti) => Promise<PostgresRow[]>
}
export default class DmlHandler implements DmlHandlerInterface {
  validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  pgClient: PgClient;
  tracer: Tracer;

  constructor (
    databaseConnectionParameters: PostgresConnectionParams,
    private readonly indexerConfig: IndexerConfig,
    pgClientInstance: PgClient | undefined = undefined,
  ) {
    this.pgClient = pgClientInstance ?? new PgClient(databaseConnectionParameters);
    this.tracer = trace.getTracer('queryapi-runner-dml-handler');
  }

  private async query (query: string, queryVars: Array<string | number>, tableName: string, operation: string): Promise<QueryResult<any>> {
    return await this.tracer.startActiveSpan(`context db ${operation}`, async (operationSpan: Span) => {
      operationSpan.setAttribute('sql query', query);
      try {
        return await wrapError(async () => await this.pgClient.query(query, queryVars), `Failed to execute '${query}' on ${this.indexerConfig.schemaName()}.${tableName}.`);
      } finally {
        operationSpan.end();
      }
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

  async insert (tableDefinitionNames: TableDefinitionNames, rowsToInsert: PostgresRow[]): Promise<PostgresRow[]> {
    if (!rowsToInsert?.length) {
      return [];
    }

    const columnNames = Object.keys(rowsToInsert[0]);
    const originalColumnNames = columnNames.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const rowValues = rowsToInsert.map(row => columnNames.map(col => row[col]));
    const query = `INSERT INTO ${this.indexerConfig.schemaName()}.${tableDefinitionNames.originalTableName} (${originalColumnNames.join(', ')}) VALUES %L RETURNING *`;

    const result = await this.query(this.pgClient.format(query, rowValues), [], tableDefinitionNames.originalTableName, 'insert');
    return result.rows;
  }

  async select (tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti, limit: number | null = null): Promise<PostgresRow[]> {
    const { queryVars, whereClause } = this.getWhereClause(whereObject, tableDefinitionNames.originalColumnNames);
    let query = `SELECT * FROM ${this.indexerConfig.schemaName()}.${tableDefinitionNames.originalTableName} WHERE ${whereClause}`;
    if (limit !== null) {
      query = query.concat(' LIMIT ', Math.round(limit).toString());
    }

    const result = await this.query(this.pgClient.format(query), queryVars, tableDefinitionNames.originalTableName, 'select');
    return result.rows;
  }

  async update (tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseSingle, updateObject: any): Promise<PostgresRow[]> {
    const updateKeys = Object.keys(updateObject).map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const updateParam = Array.from({ length: updateKeys.length }, (_, index) => `${updateKeys[index]}=$${index + 1}`).join(', ');
    const whereKeys = Object.keys(whereObject).map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const whereParam = Array.from({ length: whereKeys.length }, (_, index) => `${whereKeys[index]}=$${index + 1 + updateKeys.length}`).join(' AND ');

    const queryValues = [...Object.values(updateObject), ...Object.values(whereObject)] as Array<string | number>;
    const query = `UPDATE ${this.indexerConfig.schemaName()}.${tableDefinitionNames.originalTableName} SET ${updateParam} WHERE ${whereParam} RETURNING *`;

    const result = await this.query(this.pgClient.format(query), queryValues, tableDefinitionNames.originalTableName, 'update');
    return result.rows;
  }

  async upsert (tableDefinitionNames: TableDefinitionNames, rowsToUpsert: PostgresRow[], conflictColumns: string[], updateColumns: string[]): Promise<PostgresRow[]> {
    if (!rowsToUpsert?.length) {
      return [];
    }
    conflictColumns = conflictColumns.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    updateColumns = updateColumns.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);

    const columns = Object.keys(rowsToUpsert[0]);
    const originalColumns = columns.map((col) => tableDefinitionNames.originalColumnNames.get(col) ?? col);
    const rowValues = rowsToUpsert.map(row => columns.map(col => row[col]));
    const updatePlaceholders = updateColumns.map(col => `${col} = excluded.${col}`).join(', ');
    const query = `INSERT INTO ${this.indexerConfig.schemaName()}.${tableDefinitionNames.originalTableName} (${originalColumns.join(', ')}) VALUES %L ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updatePlaceholders} RETURNING *`;

    const result = await this.query(this.pgClient.format(query, rowValues), [], tableDefinitionNames.originalTableName, 'upsert');
    return result.rows;
  }

  async delete (tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti): Promise<PostgresRow[]> {
    const { queryVars, whereClause } = this.getWhereClause(whereObject, tableDefinitionNames.originalColumnNames);
    const query = `DELETE FROM ${this.indexerConfig.schemaName()}.${tableDefinitionNames.originalTableName} WHERE ${whereClause} RETURNING *`;

    const result = await this.query(this.pgClient.format(query), queryVars, tableDefinitionNames.originalTableName, 'delete');
    return result.rows;
  }
}
