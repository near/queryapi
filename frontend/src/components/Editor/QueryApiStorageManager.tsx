export default class QueryAPIStorageManager {
  private indexerCodeStorageKey: string;
  private schemaCodeStorageKey: string;
  private schemaTypesStorageKey: string;
  private cursorPositionKey: string;
  private debugListStorageKey: string;

  constructor(accountID: string, indexerName: string) {
    this.indexerCodeStorageKey = this.createStorageKey('IndexerCode', accountID, indexerName);
    this.schemaCodeStorageKey = this.createStorageKey('SchemaCode', accountID, indexerName);
    this.schemaTypesStorageKey = this.createStorageKey('SchemaTypes', accountID, indexerName);
    this.cursorPositionKey = this.createStorageKey('CursorPosition', accountID, indexerName);
    this.debugListStorageKey = this.createStorageKey('DebugList', accountID, indexerName);
  }

  private createStorageKey(type: string, accountID: string, indexerName: string): string {
    return `QueryAPI:${type}:${accountID}#${indexerName || 'new'}`;
  }

  private saveToLocalStorage(key: string, data: any): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private getFromLocalStorage(key: string): any {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  setIndexerCode(data: any): void {
    this.saveToLocalStorage(this.indexerCodeStorageKey, data);
  }

  getIndexerCode(): any {
    return this.getFromLocalStorage(this.indexerCodeStorageKey);
  }

  setSchemaCode(data: any): void {
    this.saveToLocalStorage(this.schemaCodeStorageKey, data);
  }

  getSchemaCode(): any {
    return this.getFromLocalStorage(this.schemaCodeStorageKey);
  }

  setSchemaTypes(data: any): void {
    this.saveToLocalStorage(this.schemaTypesStorageKey, data);
  }

  getSchemaTypes(): any {
    return this.getFromLocalStorage(this.schemaTypesStorageKey);
  }

  setCursorPosition(data: any): void {
    this.saveToLocalStorage(this.cursorPositionKey, data);
  }

  getCursorPosition(): any {
    return this.getFromLocalStorage(this.cursorPositionKey);
  }

  setDebugList(data: any): void {
    this.saveToLocalStorage(this.debugListStorageKey, data);
  }

  getDebugList(): any {
    return this.getFromLocalStorage(this.debugListStorageKey);
  }

  // public logStorageState(): void {
  //   console.log('Indexer Code Storage Key:', this.indexerCodeStorageKey);
  //   console.log('Schema Code Storage Key:', this.schemaCodeStorageKey);
  //   console.log('Schema Types Storage Key:', this.schemaTypesStorageKey);
  //   console.log('Cursor Position Key:', this.cursorPositionKey);
  //   console.log('Debug List Storage Key:', this.debugListStorageKey);

  //   console.log('Stored Indexer Code:', this.getIndexerCode());
  //   console.log('Stored Schema Code:', this.getSchemaCode());
  //   console.log('Stored Schema Types:', this.getSchemaTypes());
  //   console.log('Stored Cursor Position:', this.getCursorPosition());
  //   console.log('Stored Debug List:', this.getDebugList());
  // }
}
