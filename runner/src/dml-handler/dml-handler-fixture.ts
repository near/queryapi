import { AST, Parser } from "node-sql-parser";
import { TableDefinitionNames } from "../indexer";
import { PostgresRow, WhereClauseMulti, WhereClauseSingle } from "./dml-handler";
// import { DmlHandlerI } from "./dml-handler";

type IndexerData = Map<string, DataRow[]>;
interface TableSpecification {
  tableName: string
  columnNames: string[]
  primaryKeys: string[]
  serialKeys: string[]
}
type IndexerDataSpecification = Map<string, TableSpecification>;

class DataRow {
  data: any;
  private primaryKeys: string[];

  constructor(data: any, primaryKeys: string[]) {
    this.data = data;
    this.primaryKeys = primaryKeys.sort();
  }

  primaryKey(): any {
    return JSON.stringify(
      this.primaryKeys.reduce((acc, key) => {
        acc[key] = this.data[key];
        return acc;
      }, {} as Record<string, any>)
    );
  }
}

class InMemoryIndexerData {
  data: IndexerData;
  tableSpecs: IndexerDataSpecification;
  serialCounter: Map<string, number>;

  constructor(schema: AST[], indexerData?: IndexerData, serialCounter?: Map<string, number>) {
    this.data = indexerData ?? new Map();
    this.tableSpecs = this.collectTableSpecifications(schema);
    this.serialCounter = serialCounter ?? new Map();
  }

  private collectTableSpecifications(schemaAST: AST[]): IndexerDataSpecification {
    const tableSpecs = new Map();
    for (const statement of schemaAST) {
      if (statement.type === "create" && statement.keyword === "table") {
        const tableSpec = this.createTableSpecification(statement);
        tableSpecs.set(tableSpec.tableName, tableSpec);
      }
    }

    return tableSpecs;
  }

  private createTableSpecification(createTableStatement: any): TableSpecification {
    const tableName = createTableStatement.table[0].table;
    const columnNames = [];
    const primaryKeys = [];
    const serialKeys = [];

    for (const columnDefinition of createTableStatement.create_definitions ?? []) {
      if (columnDefinition.column) {
        const columnName = this.getColumnName(columnDefinition);
        columnNames.push(columnName);

        const dataType = columnDefinition.definition.dataType as string;
        if (dataType.toUpperCase().includes('SERIAL')) {
          serialKeys.push(columnName);
        }

      } else if (columnDefinition.constraint && columnDefinition.constraint_type === "primary key") {
        for (const primaryKey of columnDefinition.definition) {
          primaryKeys.push(primaryKey.column.expr.value);
        }
      }
    }
    const tableSpec: TableSpecification = {
      tableName,
      columnNames,
      primaryKeys,
      serialKeys,
    };

    return tableSpec;
  }

  private getColumnName(columnDefinition: any): string {
    if (columnDefinition.column?.type === 'column_ref') {
      return columnDefinition.column.column.expr.value;
    }
    return "";
  }

  getSerialValue(tableName: string, columnName: string): number {
    const serialCounterKey = `${tableName}-${columnName}`;
    let counterValue = this.serialCounter.get(serialCounterKey) ?? 0;
    this.serialCounter.set(serialCounterKey, counterValue + 1);
    return counterValue;
  }

  findRow(tableName: string, row: DataRow): DataRow | undefined {
    const data = this.data.get(tableName) ?? [];
    for (const existingRow of data) {
      if (existingRow.primaryKey() === row.primaryKey()) {
        return existingRow;
      }
    }
    return undefined;
  }

  findRows(tableName: string, criteria: WhereClauseSingle | WhereClauseMulti, limit: number | null = null): DataRow[] {
    const results = [];
    const data = this.data.get(tableName) ?? [];
    for (const existingRow of data) {
      let match = true;
      for (const attribute of Object.keys(criteria)) {
        const matchValues = criteria[attribute];
        if (Array.isArray(matchValues)) {
          if (!(matchValues.includes(existingRow.data[attribute]))) {
            match = false;
          }
        } else if (existingRow.data[attribute] !== criteria[attribute]) {
          match = false;
        }
      }
      if (match) {
        results.push(existingRow);
        if (limit && results.length >= limit) {
          return results;
        }
      }
    }
    return results;
  }

  insertRow(tableName: string, row: any): DataRow {
    const tableSpec = this.tableSpecs.get(tableName) as TableSpecification;
    for (const serialKey of tableSpec.serialKeys) {
      if (row[serialKey] === undefined) {
        row[serialKey] = this.getSerialValue(tableName, serialKey);
      }
    }

    const dataRow = new DataRow(row, tableSpec.primaryKeys);
    if (this.findRow(tableName, dataRow)) {
      throw new Error('Cannot insert row twice into the same table');
    }
    const data = this.data.get(tableName) ?? [];
    data.push(dataRow);
    this.data.set(tableName, data);
    return dataRow;
  }

  removeRows(tableName: string, criteria: WhereClauseMulti, limit: number | null = null): DataRow[] {
    const matchingRows = this.findRows(tableName, criteria, limit);
    let data = this.data.get(tableName) ?? [];
    data = data.filter(row => !matchingRows.includes(row));
    this.data.set(tableName, data);
    return matchingRows ?? [];
  }

  updateRows(tableName: string, criteria: WhereClauseSingle, updateObject: any): DataRow[] {
    const existingRows = this.removeRows(tableName, criteria);
    const data = this.data.get(tableName) ?? [];

    for (const row of existingRows) {
      for (const [attribute, value] of Object.entries(updateObject)) {
        row.data[attribute] = value;
      }
      data.push(row);
    }
    this.data.set(tableName, data);
    return existingRows;
  }

  public insert(tableName: string, rowsToInsert: PostgresRow[]): PostgresRow[] {
    // TODO: Check types of columns
    // TODO: Verify columns are correctly named, and have any required values
    const insertedRows = [];
    for (const row of rowsToInsert) {
      insertedRows.push(this.insertRow(tableName, row).data);
    }
    return rowsToInsert;
  }

  public select(tableName: string, criteria: WhereClauseMulti, limit: number | null): PostgresRow[] {
    return this.findRows(tableName, criteria, limit).map(row => row.data);
  }

  public update(tableName: string, criteria: WhereClauseSingle, updateObject: any): PostgresRow[] {
    return this.updateRows(tableName, criteria, updateObject).map(item => item.data);
  }

  public upsert(tableName: string, rowsToUpsert: PostgresRow[], conflictColumns: string[], updateColumns: string[]): PostgresRow[] {
    // TODO: Verify conflictColumns is a superset of primary key set (For uniqueness constraint)
    let upsertedRows: PostgresRow[] = [];
    for (const row of rowsToUpsert) {
      const conflictRow = conflictColumns.reduce((criteria, attribute) => {
        if (attribute in row) {
          criteria[attribute] = row[attribute];
        }
        return criteria;
      }, {} as Record<string, any>);
      if (this.findRows(tableName, conflictRow).length > 0) {
        const updateRow = updateColumns.reduce((updateObj, attribute) => {
          if (attribute in row) {
            updateObj[attribute] = row[attribute];
          }
          return updateObj;
        }, {} as Record<string, any>);
        const updatedRow = this.update(tableName, conflictRow, updateRow);
        upsertedRows = upsertedRows.concat(updatedRow);
      } else {
        upsertedRows.push(this.insertRow(tableName, row).data);
      }
    }

    return upsertedRows;
  }

  public delete(tableName: string, deleteCriteria: WhereClauseMulti): PostgresRow[] {
    return this.removeRows(tableName, deleteCriteria).map(row => row.data);
  }
}

export default class InMemoryDmlHandler /* implements DmlHandlerI */ {
  indexerData: InMemoryIndexerData;

  constructor(schema: string) {
    const parser = new Parser();
    let schemaAST = parser.astify(schema, { database: 'Postgresql' });
    schemaAST = Array.isArray(schemaAST) ? schemaAST : [schemaAST]; // Ensure iterable
    this.indexerData = new InMemoryIndexerData(schemaAST);
  }

  async insert(tableDefinitionNames: TableDefinitionNames, rowsToInsert: PostgresRow[]): Promise<PostgresRow[]> {
    if (!rowsToInsert?.length) {
      return [];
    }

    return this.indexerData.insert(tableDefinitionNames.originalTableName, rowsToInsert);
  }

  async select(tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti, limit: number | null = null): Promise<PostgresRow[]> {
    return this.indexerData.select(tableDefinitionNames.originalTableName, whereObject, limit);
  }

  async update(tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseSingle, updateObject: any): Promise<PostgresRow[]> {
    return this.indexerData.update(tableDefinitionNames.originalTableName, whereObject, updateObject);
  }


  async upsert(tableDefinitionNames: TableDefinitionNames, rowsToUpsert: PostgresRow[], conflictColumns: string[], updateColumns: string[]): Promise<PostgresRow[]> {
    return this.indexerData.upsert(tableDefinitionNames.originalTableName, rowsToUpsert, conflictColumns, updateColumns);
  }

  async delete(tableDefinitionNames: TableDefinitionNames, whereObject: WhereClauseMulti): Promise<PostgresRow[]> {
    return this.indexerData.delete(tableDefinitionNames.originalTableName, whereObject);
  }
}

