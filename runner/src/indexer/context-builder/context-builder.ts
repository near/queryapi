import fetch from 'node-fetch';
import { type Response } from 'node-fetch';
import { Parser } from 'node-sql-parser';
import { type DmlHandlerInterface } from '../../dml-handler/dml-handler';
import { type TableDefinitionNames } from '../indexer';
import type IndexerConfig from '../../indexer-config/indexer-config';
import { LogEntry } from '../../indexer-meta';
import { wrapSpan } from '../../utility';
import assert from 'assert';
import logger from '../../logger';
import { trace } from '@opentelemetry/api';

export interface ContextObject {
  graphql: (operation: string, variables?: Record<string, any>) => Promise<any>
  set: (key: string, value: any) => Promise<any>
  debug: (message: string) => void
  log: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  fetchFromSocialApi: (path: string, options?: any) => Promise<any>
  db: Record<string, Record<string, (...args: any[]) => any>>
}

interface Dependencies {
  fetch?: typeof fetch
  dmlHandler: DmlHandlerInterface
  parser?: Parser
}

interface Config {
  hasuraAdminSecret: string
  hasuraEndpoint: string
}

const defaultConfig: Config = {
  hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET ?? '',
  hasuraEndpoint: process.env.HASURA_ENDPOINT ?? '',
};

export default class ContextBuilder {
  DEFAULT_HASURA_ROLE: string = 'append';

  tracer = trace.getTracer('queryapi-runner-context');
  private readonly logger: typeof logger;
  tableDefinitions: Map<string, TableDefinitionNames>;
  deps: Required<Dependencies>;

  constructor (
    private readonly indexerConfig: IndexerConfig,
    deps: Dependencies,
    private readonly config: Config = defaultConfig,
  ) {
    this.logger = logger.child({ accountId: indexerConfig.accountId, functionName: indexerConfig.functionName, service: this.constructor.name });

    this.deps = {
      fetch,
      parser: new Parser(),
      ...deps
    };
    // TODO: Move Parsing logic to separate class
    this.tableDefinitions = getTableNameToDefinitionNamesMapping(indexerConfig.schema);
  }

  private sanitizeTableName (tableName: string): string {
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

  private async runGraphQLQuery (operation: string, variables: any, blockHeight: number, hasuraRoleName: string | null, logError: boolean = true): Promise<any> {
    assert(this.config.hasuraAdminSecret !== '' && this.config.hasuraEndpoint !== '', 'hasuraAdminSecret and hasuraEndpoint env variables are required');
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

  buildContext (blockHeight: number, logEntries: LogEntry[]): ContextObject {
    return {
      graphql: async (operation: string, variables?: Record<string, any>) => {
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

  buildDatabaseContext (
    blockHeight: number,
    logEntries: LogEntry[],
  ): Record<string, Record<string, (...args: any[]) => any>> {
    if (this.tableDefinitions.size === 0) {
      logEntries.push(LogEntry.systemDebug('No tables found in schema. No context.db methods generated'));
      return {};
    }
    try {
      const tableNames = Array.from(this.tableDefinitions.keys());
      const sanitizedTableNames = new Set<string>();
      const dmlHandler: DmlHandlerInterface = this.deps.dmlHandler;

      // Generate and collect methods for each table name
      const result = tableNames.reduce((prev, tableName) => {
        // Generate sanitized table name and ensure no conflict
        const sanitizedTableName = this.sanitizeTableName(tableName);
        const tableDefinitionNames: TableDefinitionNames = this.tableDefinitions.get(tableName) as TableDefinitionNames;
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
    } catch (err) {
      const error = err as Error;
      logEntries.push(LogEntry.systemWarn(`Caught error when generating context.db methods: ${error.message}`));
    }
    return {}; // Default to empty object if error
  }
}

// TODO: Migrate all below code to separate class
function getColumnDefinitionNames (columnDefs: any[]): Map<string, string> {
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

function retainOriginalQuoting (schema: string, tableName: string): string {
  const createTableQuotedRegex = `\\b(create|CREATE)\\s+(table|TABLE)\\s+"${tableName}"\\s*`;

  if (schema.match(new RegExp(createTableQuotedRegex, 'i'))) {
    return `"${tableName}"`;
  }

  return tableName;
}

function getTableNameToDefinitionNamesMapping (schema: string): Map<string, TableDefinitionNames> {
  const parser = new Parser();
  let schemaSyntaxTree = parser.astify(schema, { database: 'Postgresql' });
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
            tableName,
            originalTableName: retainOriginalQuoting(schema, tableName),
            originalColumnNames: getColumnDefinitionNames(createDefs)
          };
          tableNameToDefinitionNamesMap.set(tableName, tableDefinitionNames);
        }
      }
    }
  }

  return tableNameToDefinitionNamesMap;
}
