import { AST, Parser } from "node-sql-parser";
import { TableDefinitionNames } from "../indexer";
import { PostgresRow, WhereClauseMulti, WhereClauseSingle } from "./dml-handler";
import { DmlHandlerI } from "./dml-handler";

interface TableSpecification {
  tableName: string
  columnNames: string[]
  primaryKeyColumns: string[]
  serialColumns: string[]
}

class PostgresRowEntity {
  data: PostgresRow;
  private primaryKeys: string[];

  constructor(data: any, primaryKeys: string[]) {
    this.data = data;
    this.primaryKeys = primaryKeys.sort();

    // TODO: Verify value of primary key as well (if primary key is NOT NULL)
    if (!primaryKeys.every(primaryKey => {
      return primaryKey in data;
    })) {
      throw new Error('Inserted row must specify value for primary key columns');
    }
  }

  primaryKey(): string {
    return JSON.stringify(
      this.primaryKeys.reduce((acc, key) => {
        acc[key] = this.data[key];
        return acc;
      }, {} as Record<string, any>)
    );
  }

  isEqualRow(row: PostgresRow): boolean {
    return this.primaryKeys.every(primaryKey => {
      return row[primaryKey] === this.data[primaryKey];
    });
  }

  isEqualEntity(entity: PostgresRowEntity): boolean {
    return this.primaryKey() === entity.primaryKey();
  }

  isEqualCriteria(criteria: WhereClauseMulti): boolean {
    return Object.keys(criteria).every(attribute => {
      const toMatchValue = criteria[attribute];
      if (Array.isArray(toMatchValue)) {
        return toMatchValue.includes(this.data[attribute]);
      }
      return toMatchValue === this.data[attribute];
    });
  }

  update(updateObject: PostgresRow): void {
    Object.keys(updateObject).map(updateKey => {
      this.data[updateKey] = updateObject[updateKey];
    });
  }
}

class TableData {
  specification: TableSpecification;
  data: PostgresRowEntity[];
  serialCounter: Map<string, number>;

  constructor(tableSpec: TableSpecification) {
    this.specification = tableSpec;
    this.data = [];
    this.serialCounter = new Map();
  }

  getEntitiesByCriteria(criteria: WhereClauseMulti, limit: number | null): PostgresRowEntity[] {
    const matchedRows: PostgresRowEntity[] = [];
    this.data.map(row => {
      if (row.isEqualCriteria(criteria)) {
        if (!limit || (limit && matchedRows.length <= limit)) {
          matchedRows.push(row);
        }
      }
    });
    return matchedRows;
  }

  getSerialValue(columnName: string): number {
    const serialCounterKey = `${this.specification.tableName}-${columnName}`;
    let counterValue = this.serialCounter.get(serialCounterKey) ?? 0;
    this.serialCounter.set(serialCounterKey, counterValue + 1);
    return counterValue;
  }

  fillSerialValues(row: PostgresRow): void {
    for (const serialColumnName of this.specification.serialColumns) {
      if (row[serialColumnName] === undefined) {
        row[serialColumnName] = this.getSerialValue(serialColumnName);
      }
    }
  }

  convertRowToEntity(row: PostgresRow): PostgresRowEntity {
    const rowCopy = { ...row };
    // TODO: Also fill default values
    // TODO: Assert non null values
    this.fillSerialValues(rowCopy);
    return new PostgresRowEntity(rowCopy, this.specification.primaryKeyColumns);
  }

  rowIsUnique(otherRow: PostgresRow): boolean {
    return this.data.every(entity => {
      return !entity.isEqualRow(otherRow);
    });
  }

  entityIsUnique(otherEntity: PostgresRowEntity): boolean {
    return this.data.every(entity => {
      return !entity.isEqualEntity(otherEntity);
    });
  }

  insertRow(row: PostgresRow): PostgresRowEntity {
    const entity = this.convertRowToEntity(row);
    if (!this.entityIsUnique(entity)) {
      throw new Error('Cannot insert row twice into the same table');
    }

    this.data.push(entity);
    return entity;
  }

  insertEntity(entity: PostgresRowEntity): PostgresRowEntity {
    if (!this.entityIsUnique(entity)) {
      throw new Error('Cannot insert row twice into the same table');
    }

    this.data.push(entity);
    return entity;
  }

  removeEntitiesByCriteria(criteria: WhereClauseMulti): PostgresRowEntity[] {
    const remainingRows: PostgresRowEntity[] = [];
    const matchedRows: PostgresRowEntity[] = [];
    this.data.map(row => {
      if (row.isEqualCriteria(criteria)) {
        matchedRows.push(row)
      } else {
        remainingRows.push(row);
      }
    });
    this.data = remainingRows;
    return matchedRows;
  }

  removeEntity(entity: PostgresRowEntity): PostgresRowEntity {
    const matchingIndex = this.data.findIndex(existingEntity => existingEntity.isEqualEntity(entity));
    return this.data.splice(matchingIndex, 1)[0];
  }
}

class IndexerData {
  tables: Map<string, TableData>;

  constructor(schema: AST[]) {
    this.tables = this.initializeTables(schema);
  }

  private initializeTables(schemaAST: AST[]): Map<string, TableData> {
    const tables = new Map();
    for (const statement of schemaAST) {
      if (statement.type === "create" && statement.keyword === "table") {
        const tableSpec = this.createTableSpecification(statement);
        tables.set(tableSpec.tableName, new TableData(tableSpec));
      }
    }

    return tables;
  }

  private createTableSpecification(createTableStatement: any): TableSpecification {
    const tableName = createTableStatement.table[0].table;
    const columnNames = [];
    const primaryKeyColumns = [];
    const serialColumns = [];

    for (const columnDefinition of createTableStatement.create_definitions ?? []) {
      if (columnDefinition.column) {
        const columnName = this.getColumnName(columnDefinition);
        columnNames.push(columnName);

        const dataType = columnDefinition.definition.dataType as string;
        if (dataType.toUpperCase().includes('SERIAL')) {
          serialColumns
            .push(columnName);
        }

      } else if (columnDefinition.constraint && columnDefinition.constraint_type === "primary key") {
        for (const primaryKey of columnDefinition.definition) {
          primaryKeyColumns.push(primaryKey.column.expr.value);
        }
      }
    }
    const tableSpec: TableSpecification = {
      tableName,
      columnNames,
      primaryKeyColumns,
      serialColumns,
    };

    return tableSpec;
  }

  private getColumnName(columnDefinition: any): string {
    if (columnDefinition.column?.type === 'column_ref') {
      return columnDefinition.column.column.expr.value;
    }
    return "";
  }

  selectColumnsFromRow(row: PostgresRow, columnsToSelect: string[]): PostgresRow {
    return columnsToSelect.reduce((newRow, columnName) => {
      if (columnName in row) {
        newRow[columnName] = row[columnName];
        return newRow;
      }
      return newRow;
    }, {} as PostgresRow);
  }

  public getTableData(tableName: string): TableData {
    const tableData = this.tables.get(tableName);
    if (!tableData) {
      throw new Error('Invalid table name provided');
    }

    return tableData;
  }
  public select(tableName: string, criteria: WhereClauseMulti, limit: number | null): PostgresRow[] {
    const tableData = this.getTableData(tableName);
    return tableData.getEntitiesByCriteria(criteria, limit).map(entity => entity.data);
  }

  public insert(tableName: string, rowsToInsert: PostgresRow[]): PostgresRow[] {
    // TODO: Check types of columns
    // TODO: Verify columns are correctly named, and have any required values
    // TODO: Verify inserts are unique before actual insertion
    const tableData = this.getTableData(tableName);
    const insertedRows: PostgresRow[] = [];

    for (const row of rowsToInsert) {
      if (!tableData.rowIsUnique(row)) {
        throw new Error('Cannot insert row twice into the same table');
      }
      insertedRows.push(tableData.insertRow(row).data);
    }

    return insertedRows;
  }

  public update(tableName: string, criteria: WhereClauseSingle, updateObject: PostgresRow): PostgresRow[] {
    // TODO: Validate criteria passed in has valid column names
    const tableData = this.getTableData(tableName);
    const updatedRows: PostgresRow[] = [];

    const matchedRows = tableData.removeEntitiesByCriteria(criteria);
    for (const rowEntity of matchedRows) {
      rowEntity.update(updateObject);
      updatedRows.push(tableData.insertEntity(rowEntity).data);
    }

    return updatedRows;
  }

  public upsert(tableName: string, rowsToUpsert: PostgresRow[], conflictColumns: string[], updateColumns: string[]): PostgresRow[] {
    // TODO: Verify conflictColumns is a superset of primary key set (For uniqueness constraint)
    const tableData = this.getTableData(tableName);
    const upsertedRows: PostgresRow[] = [];

    for (const row of rowsToUpsert) {
      const updateCriteriaObject = this.selectColumnsFromRow(row, conflictColumns);
      const matchedEntity = tableData.removeEntitiesByCriteria(updateCriteriaObject)[0];

      if (matchedEntity) {
        const updateObject = this.selectColumnsFromRow(row, updateColumns);
        matchedEntity.update(updateObject);
        upsertedRows.push(tableData.insertEntity(matchedEntity).data);
      } else {
        upsertedRows.push(tableData.insertRow(row).data);
      }
    }

    return upsertedRows;
  }

  public delete(tableName: string, deleteCriteria: WhereClauseMulti): PostgresRow[] {
    const tableData = this.getTableData(tableName);
    return tableData.removeEntitiesByCriteria(deleteCriteria).map(entity => entity.data);
  }
}

export default class InMemoryDmlHandler implements DmlHandlerI {
  indexerData: IndexerData;

  constructor(schema: string) {
    const parser = new Parser();
    let schemaAST = parser.astify(schema, { database: 'Postgresql' });
    schemaAST = Array.isArray(schemaAST) ? schemaAST : [schemaAST]; // Ensure iterable
    this.indexerData = new IndexerData(schemaAST);
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

