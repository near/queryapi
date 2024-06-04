import fetch, { type Response } from 'node-fetch';
import { VM } from 'vm2';
import * as lakePrimitives from '@near-lake/primitives';
import { Parser } from 'node-sql-parser';
import { trace, type Span } from '@opentelemetry/api';
import VError from 'verror';

import logger from '../logger';
import Provisioner from '../provisioner';
import DmlHandler from '../dml-handler/dml-handler';
import LogEntry from '../indexer-meta/log-entry';
import type IndexerConfig from '../indexer-config';
import { type PostgresConnectionParams } from '../pg-client';
import IndexerMeta, { IndexerStatus } from '../indexer-meta';
import { wrapSpan } from '../utility';
import { performance } from 'perf_hooks';

import fs from 'fs';

interface Dependencies {
  fetch: typeof fetch
  provisioner: Provisioner
  dmlHandler?: DmlHandler
  indexerMeta?: IndexerMeta
  parser: Parser
};

interface Context {
  graphql: (operation: string, variables?: Record<string, any>) => Promise<any>
  set: (key: string, value: any) => Promise<any>
  debug: (message: string) => void
  log: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  fetchFromSocialApi: (path: string, options?: any) => Promise<any>
  db: Record<string, Record<string, (...args: any[]) => any>>
}

export interface TableDefinitionNames {
  originalTableName: string
  originalColumnNames: Map<string, string>
}

interface Config {
  hasuraAdminSecret: string
  hasuraEndpoint: string
}

const defaultConfig: Config = {
  hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET,
  hasuraEndpoint: process.env.HASURA_ENDPOINT,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const performanceNow = (): number => performance.now();

export default class Indexer {
  DEFAULT_HASURA_ROLE: string;
  IS_FIRST_EXECUTION: boolean = true;
  tracer = trace.getTracer('queryapi-runner-indexer');

  private readonly logger: typeof logger;
  private readonly deps: Dependencies;
  private database_connection_parameters: PostgresConnectionParams | undefined;
  private currentStatus?: string;

  constructor (
    private readonly indexerConfig: IndexerConfig,
    deps?: Partial<Dependencies>,
    databaseConnectionParameters: PostgresConnectionParams | undefined = undefined,
    private readonly config: Config = defaultConfig,
  ) {
    this.logger = logger.child({ accountId: indexerConfig.accountId, functionName: indexerConfig.functionName, service: this.constructor.name });

    this.DEFAULT_HASURA_ROLE = 'append';
    this.deps = {
      fetch,
      provisioner: new Provisioner(),
      parser: new Parser(),
      ...deps,
    };
    this.database_connection_parameters = databaseConnectionParameters;
  }

  async execute (
    block: lakePrimitives.Block,
  ): Promise<string[]> {
    const blockHeight: number = block.blockHeight;

    const lag = Date.now() - Math.floor(Number(block.header().timestampNanosec) / 1000000);

    const simultaneousPromises: Array<Promise<any>> = [];
    const allMutations: string[] = [];
    const logEntries: LogEntry[] = [];

    try {
      const runningMessage = `Running function ${this.indexerConfig.fullName()} on block ${blockHeight}, lag is: ${lag?.toString()}ms from block timestamp`;
      console.log(runningMessage);

      try {
        if (!await this.deps.provisioner.fetchUserApiProvisioningStatus(this.indexerConfig)) {
          logEntries.push(LogEntry.systemInfo('Provisioning endpoint: starting', blockHeight));
          await this.deps.provisioner.provisionUserApi(this.indexerConfig);
          logEntries.push(LogEntry.systemInfo('Provisioning endpoint: successful', blockHeight));
        }
      } catch (e) {
        const error = e as Error;
        if (this.IS_FIRST_EXECUTION) {
          this.logger.error('Provisioning endpoint: failure', error);
        }
        logEntries.push(LogEntry.systemError(`Provisioning endpoint failure: ${error.message}`, blockHeight));
        throw error;
      }

      logEntries.push(LogEntry.systemInfo(runningMessage, blockHeight));
      // Cache database credentials after provisioning
      await wrapSpan(async () => {
        try {
          this.database_connection_parameters ??= await this.deps.provisioner.getPgBouncerConnectionParameters(this.indexerConfig.hasuraRoleName());
          this.deps.indexerMeta ??= new IndexerMeta(this.indexerConfig, this.database_connection_parameters);
          this.deps.dmlHandler ??= new DmlHandler(this.database_connection_parameters, this.indexerConfig);
        } catch (e) {
          const error = e as Error;
          logEntries.push(LogEntry.systemError(`Failed to get database connection parameters: ${error.message}`, blockHeight));
          throw error;
        }
      }, this.tracer, 'get database connection parameters');

      const resourceCreationSpan = this.tracer.startSpan('prepare vm and context to run indexer code');
      // simultaneousPromises.push(this.setStatus(IndexerStatus.RUNNING));
      const vm = new VM({ allowAsync: true });
      const context = this.buildContext(blockHeight, logEntries);

      vm.freeze(block, 'block');
      vm.freeze(lakePrimitives, 'primitives');
      vm.freeze(context, 'context');
      vm.freeze(context, 'console'); // provide console.log via context.log
      vm.freeze(performance.now.bind(performance), 'performanceNow');
      // vm.freeze(() => { return 0; }, 'performanceNow');
      resourceCreationSpan.end();

      await this.tracer.startActiveSpan('run indexer code', async (runIndexerCodeSpan: Span) => {
        try {
          const transformedCode = this.transformIndexerFunction();
          // eval(transformedCode); // eslint-disable-line no-eval
          await vm.run(transformedCode);
        } catch (e) {
          const error = e as Error;
          logEntries.push(LogEntry.systemError(`Error running IndexerFunction: ${error.message}`, blockHeight));

          throw new VError(error, 'Execution error');
        } finally {
          runIndexerCodeSpan.end();
        }
      });
      // simultaneousPromises.push(this.updateIndexerBlockHeight(blockHeight));
    // eslint-disable-next-line no-useless-catch
    } catch (e) {
      // TODO: Prevent unnecesary reruns of set status
      // simultaneousPromises.push(await this.setStatus(IndexerStatus.FAILING));
      throw e;
    } finally {
      // const results = await Promise.allSettled([(this.deps.indexerMeta as IndexerMeta).writeLogs(logEntries), ...simultaneousPromises]);
      // if (this.IS_FIRST_EXECUTION && results[0].status === 'rejected') {
      //   this.logger.error('Failed to write logs after executing on block:', results[0].reason);
      // }
      this.IS_FIRST_EXECUTION = false;
    }
    return allMutations;
  }

  public buildContext (blockHeight: number, logEntries: LogEntry[]): Context {
    return {
      graphql: async (operation, variables) => {
        return await wrapSpan(async () => {
          return await this.runGraphQLQuery(operation, variables, blockHeight, this.indexerConfig.hasuraRoleName());
        }, this.tracer, `Call graphql ${operation.includes('mutation') ? 'mutation' : 'query'} through Hasura`);
      },
      set: async (key, value) => {
        const mutation = `
          mutation SetKeyValue($function_name: String!, $key: String!, $value: String!) {
            insert_${this.indexerConfig.hasuraRoleName()}_${this.indexerConfig.hasuraFunctionName()}_indexer_storage_one(object: {function_name: $function_name, key_name: $key, value: $value} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}
          }`;
        const variables = {
          function_name: this.indexerConfig.fullName(),
          key,
          value: value ? JSON.stringify(value) : null
        };
        return await wrapSpan(async () => {
          return await this.runGraphQLQuery(mutation, variables, blockHeight, this.indexerConfig.hasuraRoleName());
        }, this.tracer, 'call insert mutation through Hasura');
      },
      debug: (...log) => {
        const debugLogEntry = LogEntry.userDebug(log.join(' : '), blockHeight);
        logEntries.push(debugLogEntry);
      },
      log: (...log) => {
        const infoLogEntry = LogEntry.userInfo(log.join(' : '), blockHeight);
        console.log(...log);
        logEntries.push(infoLogEntry);
      },
      warn: (...log) => {
        const warnLogEntry = LogEntry.userWarn(log.join(' : '), blockHeight);
        logEntries.push(warnLogEntry);
      },
      error: (...log) => {
        const errorLogEntry = LogEntry.userError(log.join(' : '), blockHeight);
        logEntries.push(errorLogEntry);
      },
      fetchFromSocialApi: async (path, options) => {
        return await this.deps.fetch(`https://api.near.social${path}`, options);
      },
      db: this.buildDatabaseContext(blockHeight, logEntries)
    };
  }

  private getColumnDefinitionNames (columnDefs: any[]): Map<string, string> {
    const columnDefinitionNames = new Map<string, string>();
    for (const columnDef of columnDefs) {
      if (columnDef.column?.type === 'column_ref') {
        const columnNameDef = columnDef.column.column.expr;
        const actualColumnName = columnNameDef.type === 'double_quote_string' ? `"${columnNameDef.value as string}"` : columnNameDef.value;
        columnDefinitionNames.set(columnNameDef.value, actualColumnName);
      }
    }
    return columnDefinitionNames;
  }

  private retainOriginalQuoting (schema: string, tableName: string): string {
    const createTableQuotedRegex = `\\b(create|CREATE)\\s+(table|TABLE)\\s+"${tableName}"\\s*`;

    if (schema.match(new RegExp(createTableQuotedRegex, 'i'))) {
      return `"${tableName}"`;
    }

    return tableName;
  }

  getTableNameToDefinitionNamesMapping (schema: string): Map<string, TableDefinitionNames> {
    let schemaSyntaxTree = this.deps.parser.astify(schema, { database: 'Postgresql' });
    schemaSyntaxTree = Array.isArray(schemaSyntaxTree) ? schemaSyntaxTree : [schemaSyntaxTree]; // Ensure iterable
    const tableNameToDefinitionNamesMap = new Map<string, TableDefinitionNames>();

    for (const statement of schemaSyntaxTree) {
      if (statement.type === 'create' && statement.keyword === 'table' && statement.table !== undefined) {
        const tableName: string = statement.table[0].table;

        if (tableNameToDefinitionNamesMap.has(tableName)) {
          throw new Error(`Table ${tableName} already exists in schema. Table names must be unique. Quotes are not allowed as a differentiator between table names.`);
        }

        const createDefs = statement.create_definitions ?? [];
        for (const columnDef of createDefs) {
          if (columnDef.column?.type === 'column_ref') {
            const tableDefinitionNames: TableDefinitionNames = {
              originalTableName: this.retainOriginalQuoting(schema, tableName),
              originalColumnNames: this.getColumnDefinitionNames(createDefs)
            };
            tableNameToDefinitionNamesMap.set(tableName, tableDefinitionNames);
          }
        }
      }
    }

    if (tableNameToDefinitionNamesMap.size === 0) {
      throw new Error('Schema does not have any tables. There should be at least one table.');
    }

    return tableNameToDefinitionNamesMap;
  }

  sanitizeTableName (tableName: string): string {
    // Convert to PascalCase
    let pascalCaseTableName = tableName
      // Replace special characters with underscores
      .replace(/[^a-zA-Z0-9_]/g, '_')
      // Makes first letter and any letters following an underscore upper case
      .replace(/^([a-zA-Z])|_([a-zA-Z])/g, (match: string) => match.toUpperCase())
      // Removes all underscores
      .replace(/_/g, '');

    // Add underscore if first character is a number
    if (/^[0-9]/.test(pascalCaseTableName)) {
      pascalCaseTableName = '_' + pascalCaseTableName;
    }

    return pascalCaseTableName;
  }

  buildDatabaseContext (
    blockHeight: number,
    logEntries: LogEntry[],
  ): Record<string, Record<string, (...args: any[]) => any>> {
    try {
      const tableNameToDefinitionNamesMapping = this.getTableNameToDefinitionNamesMapping(this.indexerConfig.schema);
      const tableNames = Array.from(tableNameToDefinitionNamesMapping.keys());
      const sanitizedTableNames = new Set<string>();
      const dmlHandler: DmlHandler = this.deps.dmlHandler as DmlHandler;

      // Generate and collect methods for each table name
      const result = tableNames.reduce((prev, tableName) => {
        // Generate sanitized table name and ensure no conflict
        const sanitizedTableName = this.sanitizeTableName(tableName);
        const tableDefinitionNames: TableDefinitionNames = tableNameToDefinitionNamesMapping.get(tableName) as TableDefinitionNames;
        if (sanitizedTableNames.has(sanitizedTableName)) {
          throw new Error(`Table ${tableName} has the same sanitized name as another table. Special characters are removed to generate context.db methods. Please rename the table.`);
        } else {
          sanitizedTableNames.add(sanitizedTableName);
        }

        // Generate context.db methods for table
        const funcForTable = {
          [`${sanitizedTableName}`]: {
            insert: async (objectsToInsert: any) => {
              const insertLogEntry = LogEntry.userDebug(`Inserting object ${JSON.stringify(objectsToInsert)} into table ${tableName}`, blockHeight);
              logEntries.push(insertLogEntry);

              return await dmlHandler.insert(tableDefinitionNames, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert]);
            },
            select: async (filterObj: any, limit = null) => {
              const selectLogEntry = LogEntry.userDebug(`Selecting objects in table ${tableName} with values ${JSON.stringify(filterObj)} with ${limit === null ? 'no' : limit} limit`, blockHeight);
              logEntries.push(selectLogEntry);

              return await dmlHandler.select(tableDefinitionNames, filterObj, limit);
            },
            update: async (filterObj: any, updateObj: any) => {
              const updateLogEntry = LogEntry.userDebug(`Updating objects in table ${tableName} that match ${JSON.stringify(filterObj)} with values ${JSON.stringify(updateObj)}`, blockHeight);
              logEntries.push(updateLogEntry);

              return await dmlHandler.update(tableDefinitionNames, filterObj, updateObj);
            },
            upsert: async (objectsToInsert: any, conflictColumns: string[], updateColumns: string[]) => {
              const upsertLogEntry = LogEntry.userDebug(`Inserting objects into table ${tableName} with values ${JSON.stringify(objectsToInsert)}. Conflict on columns ${conflictColumns.join(', ')} will update values in columns ${updateColumns.join(', ')}`, blockHeight);
              logEntries.push(upsertLogEntry);

              return await dmlHandler.upsert(tableDefinitionNames, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert], conflictColumns, updateColumns);
            },
            delete: async (filterObj: any) => {
              const deleteLogEntry = LogEntry.userDebug(`Deleting objects from table ${tableName} with values ${JSON.stringify(filterObj)}`, blockHeight);
              logEntries.push(deleteLogEntry);

              return await dmlHandler.delete(tableDefinitionNames, filterObj);
            }
          }
        };
        return {
          ...prev,
          ...funcForTable
        };
      }, {});
      return result;
    } catch (error) {
      if (this.IS_FIRST_EXECUTION) {
        this.logger.warn('Caught error when generating context.db methods', error);
      }
    }
    return {}; // Default to empty object if error
  }

  async setStatus (status: IndexerStatus): Promise<any> {
    if (this.currentStatus === status) {
      return;
    }

    this.currentStatus = status;

    // Metadata table possibly unprovisioned when called, so I am not validating indexerMeta yet
    await this.deps.indexerMeta?.setStatus(status);
  }

  private async createIndexerMetaIfNotExists (failureMessage: string): Promise<void> {
    if (!this.deps.indexerMeta) {
      try {
        this.database_connection_parameters ??= await this.deps.provisioner.getPgBouncerConnectionParameters(this.indexerConfig.hasuraRoleName());
        this.deps.indexerMeta = new IndexerMeta(this.indexerConfig, this.database_connection_parameters);
      } catch (e) {
        const error = e as Error;
        this.logger.error(failureMessage, e);
        throw error;
      }
    }
  }

  async setStoppedStatus (): Promise<void> {
    await this.createIndexerMetaIfNotExists(`${this.indexerConfig.fullName()}: Failed to get DB params to set status STOPPED for stream`);
    const indexerMeta: IndexerMeta = this.deps.indexerMeta as IndexerMeta;
    await indexerMeta.setStatus(IndexerStatus.STOPPED);
  }

  async writeCrashedWorkerLog (logEntry: LogEntry): Promise<void> {
    await this.createIndexerMetaIfNotExists(`${this.indexerConfig.fullName()}: Failed to get DB params to write crashed worker error log for stream`);
    const indexerMeta: IndexerMeta = this.deps.indexerMeta as IndexerMeta;
    await indexerMeta.writeLogs([logEntry]);
  }

  async updateIndexerBlockHeight (blockHeight: number): Promise<void> {
    await (this.deps.indexerMeta as IndexerMeta).updateBlockHeight(blockHeight);
  }

  async runGraphQLQuery (operation: string, variables: any, blockHeight: number, hasuraRoleName: string | null, logError: boolean = true): Promise<any> {
    const response: Response = await this.deps.fetch(`${this.config.hasuraEndpoint}/v1/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hasura-Use-Backend-Only-Permissions': 'true',
        ...(hasuraRoleName && {
          'X-Hasura-Role': hasuraRoleName,
          'X-Hasura-Admin-Secret': this.config.hasuraAdminSecret,
        }),
      },
      body: JSON.stringify({
        query: operation,
        ...(variables && { variables }),
      }),
    });

    const { data, errors } = await response.json();

    if (response.status !== 200 || errors) {
      if (logError) {
        const message: string = errors ? errors.map((e: any) => e.message).join(', ') : `HTTP ${response.status} error writing with graphql to indexer storage`;
        const mutation: string =
                    `mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){
                    insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {
                    id
                  }
                }`;
        try {
          await this.runGraphQLQuery(mutation, { function_name: this.indexerConfig.fullName(), block_height: blockHeight, message }, blockHeight, this.DEFAULT_HASURA_ROLE, false);
        } catch (e) {
          this.logger.error('Error writing log of graphql error', e);
        }
      }
      throw new Error(`Failed to write graphql, http status: ${response.status}, errors: ${JSON.stringify(errors, null, 2)}`);
    }

    return data;
  }

  private enableAwaitTransform (code: string): string {
    return `
      async function f(){
        ${code}
      };
      f();
    `;
  }

  transformIndexerFunction (): string {
    return [
      this.enableAwaitTransform,
    ].reduce((acc, val) => val(acc), this.indexerConfig.code);
  }
}
