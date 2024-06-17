import { TableDefinitionNames } from "../indexer";
// import { DmlHandlerI } from "./dml-handler";

type ColumnDataMatchingRows = Map<any, Set<number>>;
type SchemaData = Map<string, ColumnDataMatchingRows>;
type SerializedTableRows = Map<string, number>;
type SerializedSchemaData = Map<string, SerializedTableRows>;

class InMemorySchemaData {
  rowCounter: number;
  serializedSchemaData: SerializedSchemaData;
  schemaData: SchemaData;

  constructor(schemaData?: SchemaData) {
    this.rowCounter = 0;
    this.serializedSchemaData = new Map();
    this.schemaData = schemaData ?? new Map();
  }

  serialize(row: any): string {
    return JSON.stringify(row, Object.keys(row).sort());
  }

  schemaDataKey(tableName: string, columnName: string): string {
    return `${tableName}-${columnName}`;
  }

  checkAllRowsUnique(tableName: string, rows: any[]): boolean {
    const rowsSerialized = new Set();
    for (const row in rows) {
      const serializedRow = this.serialize(row);
      if (rowsSerialized.has(serializedRow) || this.serializedSchemaData.get(tableName)?.has(serializedRow)) {
        return false;
      }
      rowsSerialized.add(serializedRow);
    }
    return true;
  }

  insertRow(tableName: string, row: any): void {
    const serializedRow = JSON.stringify(row, Object.keys(row).sort());
    const rowNumber = this.rowCounter++;
    const serializedTableData = this.serializedSchemaData.get(tableName) ?? new Map();

    serializedTableData.set(serializedRow, rowNumber);
    this.serializedSchemaData.set(tableName, serializedTableData);

    for (const [columnName, columnValue] of Object.entries(row)) {
      const schemaDataKey = this.schemaDataKey(tableName, columnName);
      const columnDataRowMatch = this.schemaData.get(schemaDataKey) ?? new Map();
      const matchingRows = columnDataRowMatch.get(columnName) ?? new Set();
      matchingRows.add(rowNumber);
      columnDataRowMatch.set(columnValue, matchingRows);
      this.schemaData.set(schemaDataKey, columnDataRowMatch);
    }
  }

  public insert(tableName: string, rowsToInsert: any[]): any[] {
    // TODO: Check Primary Keys instead of all column values when inserting
    // TODO: Check types of columns
    if (this.checkAllRowsUnique(tableName, rowsToInsert)) {
      for (const row in rowsToInsert) {
        this.insertRow(tableName, row);
      }
      console.log('DONE');
      return rowsToInsert;
    }
    throw new Error('Cannot insert row twice. Please remove duplicate rows from query');
  }
}

export default class DmlHandlerFixture /* implements DmlHandlerI */ {
  schemaData: InMemorySchemaData;

  constructor() {
    this.schemaData = new InMemorySchemaData();
  }

  async insert(tableDefinitionNames: TableDefinitionNames, rowsToInsert: any[]): Promise<any[]> {
    if (!rowsToInsert?.length) {
      return [];
    }

    return this.schemaData.insert(tableDefinitionNames.originalTableName, rowsToInsert);
  }
}

