import fetch, { type Response } from 'node-fetch';
import { VM } from 'vm2';
import * as lakePrimitives from '@near-lake/primitives';
import { Parser } from 'node-sql-parser';

import Provisioner from '../provisioner';
import DmlHandler from '../dml-handler/dml-handler';
import /**LogEntry,*/ { LogLevel } from '../indexer-meta/log-entry';

import { type IndexerBehavior } from '../stream-handler/stream-handler';
import /** IndexerMeta, */ { IndexerStatus } from '../indexer-meta/indexer-meta';
import { type DatabaseConnectionParameters } from '../provisioner/provisioner';
import { trace, type Span } from '@opentelemetry/api';

interface Dependencies {
  fetch: typeof fetch
  provisioner: Provisioner
  dmlHandler?: DmlHandler
  // indexerMeta?: IndexerMeta
  parser: Parser
};

interface Context {
  graphql: (operation: string, variables?: Record<string, any>) => Promise<any>
  set: (key: string, value: any) => Promise<any>
  debug: (message: string) => Promise<void>
  log: (message: string) => Promise<void>
  warn: (message: string) => Promise<void>
  error: (message: string) => Promise<void>
  fetchFromSocialApi: (path: string, options?: any) => Promise<any>
  db: Record<string, Record<string, (...args: any[]) => any>>
}

export interface TableDefinitionNames {
  originalTableName: string
  originalColumnNames: Map<string, string>
}

interface IndexerFunction {
  account_id: string
  function_name: string
  provisioned?: boolean
  schema: string
  code: string
}

interface Config {
  hasuraAdminSecret: string
  hasuraEndpoint: string
  hasuraHostOverride?: string
  hasuraPortOverride?: number
}

const defaultConfig: Config = {
  hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET,
  hasuraEndpoint: process.env.HASURA_ENDPOINT,
};

export default class Indexer {
  DEFAULT_HASURA_ROLE: string;
  tracer = trace.getTracer('queryapi-runner-indexer');

  private readonly indexer_behavior: IndexerBehavior;
  private readonly deps: Dependencies;

  private database_connection_parameters: DatabaseConnectionParameters | undefined;

  private currentStatus?: string;

  constructor (
    indexerBehavior: IndexerBehavior,
    deps?: Partial<Dependencies>,
    databaseConnectionParameters = undefined,
    private readonly config: Config = defaultConfig,
  ) {
    this.DEFAULT_HASURA_ROLE = 'append';
    this.indexer_behavior = indexerBehavior;
    this.deps = {
      fetch,
      provisioner: new Provisioner(),
      parser: new Parser(),
      ...deps,
    };
    this.database_connection_parameters = databaseConnectionParameters;
  }

  async runFunctions (
    block: lakePrimitives.Block,
    functions: Record<string, IndexerFunction>,
    isHistorical: boolean,
    options: { provision?: boolean } = { provision: false }
  ): Promise<string[]> {
    const blockHeight: number = block.blockHeight;

    const lag = Date.now() - Math.floor(Number(block.header().timestampNanosec) / 1000000);

    const simultaneousPromises: Array<Promise<any>> = [];
    const allMutations: string[] = [];
    // const logEntries: LogEntry[] = [];

    for (const functionName in functions) {
      try {
        const indexerFunction = functions[functionName];

        const runningMessage = `Running function ${functionName} on block ${blockHeight}, lag is: ${lag?.toString()}ms from block timestamp`;
        simultaneousPromises.push(this.writeLog(LogLevel.INFO, functionName, blockHeight, runningMessage));

        const hasuraRoleName = functionName.split('/')[0].replace(/[.-]/g, '_');
        if (options.provision && !indexerFunction.provisioned) {
          try {
            if (!await this.deps.provisioner.fetchUserApiProvisioningStatus(indexerFunction.account_id, indexerFunction.function_name)) {
              await this.setStatus(functionName, blockHeight, IndexerStatus.PROVISIONING);
              simultaneousPromises.push(this.writeLog(LogLevel.INFO, functionName, blockHeight, 'Provisioning endpoint: starting'));
              // const provisionStartLogEntry = LogEntry.systemInfo('Provisioning endpoint: starting', blockHeight);
              // logEntries.push(provisionStartLogEntry);
              await this.deps.provisioner.provisionUserApi(indexerFunction.account_id, indexerFunction.function_name, indexerFunction.schema);
              simultaneousPromises.push(this.writeLog(LogLevel.INFO, functionName, blockHeight, 'Provisioning endpoint: successful'));
              // const provisionSuccessLogEntry = LogEntry.systemInfo('Provisioning endpoint: starting', blockHeight);
              // logEntries.push(provisionSuccessLogEntry);
            }

            // TODO enable when new logs implementation is ready
            await this.deps.provisioner.provisionLogsIfNeeded(indexerFunction.account_id, indexerFunction.function_name);
          } catch (e) {
            const error = e as Error;
            simultaneousPromises.push(this.writeLog(LogLevel.ERROR, functionName, blockHeight, 'Provisioning endpoint: failure', error.message));
            // const provisionFailureLogEntry = LogEntry.systemError('Provisioning endpoint: starting', blockHeight);
            // logEntries.push(provisionFailureLogEntry);
            throw error;
          }
        }

        // const runningLogEntry = LogEntry.systemInfo(runningMessage, blockHeight);
        // logEntries.push(runningLogEntry);
        // Cache database credentials after provisioning
        const credentialsFetchSpan = this.tracer.startSpan('fetch database connection parameters');
        try {
          this.database_connection_parameters ??= await this.deps.provisioner.getDatabaseConnectionParameters(hasuraRoleName) as DatabaseConnectionParameters;
          // this.database_connection_parameters = await this.getDatabaseConnectionParams(hasuraRoleName);
          // this.deps.indexerMeta ??= new IndexerMeta(functionName, this.indexer_behavior.log_level, this.database_connection_parameters);
          this.deps.dmlHandler ??= new DmlHandler(this.database_connection_parameters);
        } catch (e) {
          const error = e as Error;
          await this.writeLog(LogLevel.ERROR, functionName, blockHeight, 'Failed to get database connection parameters', error.message);
          // const databaseErrorLogEntry = LogEntry.systemError('Failed to get database connection parameters', blockHeight);
          // logEntries.push(databaseErrorLogEntry);
          throw error;
        } finally {
          credentialsFetchSpan.end();
        }

        // TODO: Prevent unnecesary reruns of set status
        const resourceCreationSpan = this.tracer.startSpan('prepare vm and context to run indexer code');
        simultaneousPromises.push(this.setStatus(functionName, blockHeight, IndexerStatus.RUNNING));
        const vm = new VM({ allowAsync: true });
        const context = this.buildContext(indexerFunction.schema, functionName, blockHeight, hasuraRoleName /** , logEntries */);

        vm.freeze(block, 'block');
        vm.freeze(lakePrimitives, 'primitives');
        vm.freeze(context, 'context');
        vm.freeze(context, 'console'); // provide console.log via context.log
        resourceCreationSpan.end();

        await this.tracer.startActiveSpan('run indexer code', async (runIndexerCodeSpan: Span) => {
          const modifiedFunction = this.transformIndexerFunction(indexerFunction.code);
          try {
            await vm.run(modifiedFunction);
          } catch (e) {
            const error = e as Error;
            simultaneousPromises.push(this.writeLog(LogLevel.ERROR, functionName, blockHeight, 'Error running IndexerFunction', error.message));
            // const indexerErrorLogEntry = LogEntry.systemError('Error running IndexerFunction', blockHeight);
            // logEntries.push(indexerErrorLogEntry);
            throw e;
          } finally {
            runIndexerCodeSpan.end();
          }
        });
        simultaneousPromises.push(this.updateIndexerBlockHeight(functionName, blockHeight, isHistorical));
      } catch (e) {
        // TODO: Prevent unnecesary reruns of set status
        await this.setStatus(functionName, blockHeight, IndexerStatus.FAILING);
        throw e;
      } finally {
        await Promise.all([...simultaneousPromises/** , (this.deps.indexerMeta as IndexerMeta).writeLogs(logEntries) */]);
      }
    }
    return allMutations;
  }

  // async getDatabaseConnectionParams(hasuraRoleName: string): Promise<DatabaseConnectionParameters>  {
  //   const { username, password, database, host, port } = await this.deps.provisioner.getDatabaseConnectionParameters(hasuraRoleName) as DatabaseConnectionParameters;
  //   return {
  //     username,
  //     password,
  //     database,
  //     host: this.config.hasuraHostOverride ?? host,
  //     port: this.config.hasuraPortOverride ?? port
  //   }
  // }

  enableAwaitTransform (indexerFunction: string): string {
    return `
            async function f(){
                ${indexerFunction}
            };
            f();
    `;
  }

  transformIndexerFunction (indexerFunction: string): string {
    return [
      this.enableAwaitTransform,
    ].reduce((acc, val) => val(acc), indexerFunction);
  }

  buildContext (schema: string, functionName: string, blockHeight: number, hasuraRoleName: string /** logEntries: LogEntry[] */): Context {
    const functionNameWithoutAccount = functionName.split('/')[1].replace(/[.-]/g, '_');
    const schemaName = functionName.replace(/[^a-zA-Z0-9]/g, '_');
    return {
      graphql: async (operation, variables) => {
        const graphqlSpan = this.tracer.startSpan(`Call graphql ${operation.includes('mutation') ? 'mutation' : 'query'} through Hasura`);
        try {
          return await this.runGraphQLQuery(operation, variables, functionName, blockHeight, hasuraRoleName);
        } finally {
          graphqlSpan.end();
        }
      },
      set: async (key, value) => {
        const setSpan = this.tracer.startSpan('Call insert mutation through Hasura');
        const mutation = `
          mutation SetKeyValue($function_name: String!, $key: String!, $value: String!) {
            insert_${hasuraRoleName}_${functionNameWithoutAccount}_indexer_storage_one(object: {function_name: $function_name, key_name: $key, value: $value} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}
          }`;
        const variables = {
          function_name: functionName,
          key,
          value: value ? JSON.stringify(value) : null
        };
        try {
          return await this.runGraphQLQuery(mutation, variables, functionName, blockHeight, hasuraRoleName);
        } finally {
          setSpan.end();
        }
      },
      debug: async (...log) => {
        return await this.writeLog(LogLevel.DEBUG, functionName, blockHeight, ...log);
        // const debugLogEntry = LogEntry.systemDebug(log.join(' '), blockHeight);
        // return await this.writeLog(debugLogEntry, logEntries as LogEntry[], functionName);
      },
      log: async (...log) => {
        return await this.writeLog(LogLevel.INFO, functionName, blockHeight, ...log);
        // const infoLogEntry = LogEntry.systemInfo(log.join(' '), blockHeight);
        // return await this.writeLog(infoLogEntry, logEntries as LogEntry[], functionName);
      },
      warn: async (...log) => {
        return await this.writeLog(LogLevel.WARN, functionName, blockHeight, ...log);
        // const warnLogEntry = LogEntry.systemWarn(log.join(' '), blockHeight);
        // return await this.writeLog(warnLogEntry, logEntries as LogEntry[], functionName);
      },
      error: async (...log) => {
        return await this.writeLog(LogLevel.ERROR, functionName, blockHeight, ...log);
        // const errorLogEntry = LogEntry.systemError(log.join(' '), blockHeight);
        // return await this.writeLog(errorLogEntry, logEntries as LogEntry[], functionName);
      },
      fetchFromSocialApi: async (path, options) => {
        return await this.deps.fetch(`https://api.near.social${path}`, options);
      },
      db: this.buildDatabaseContext(functionName, schemaName, schema, blockHeight /** , logEntries as LogEntry[] */)
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
    functionName: string,
    schemaName: string,
    schema: string,
    blockHeight: number,
    // logEntries: LogEntry[],
  ): Record<string, Record<string, (...args: any[]) => any>> {
    try {
      const tableNameToDefinitionNamesMapping = this.getTableNameToDefinitionNamesMapping(schema);
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
              return await this.tracer.startActiveSpan('Call context db insert', async (insertSpan: Span) => {
                try {
                  // Write log before calling insert
                  await this.writeLog(LogLevel.DEBUG, functionName, blockHeight,
                    `Inserting object ${JSON.stringify(objectsToInsert)} into table ${tableName}`);
                  // const insertLogEntry = LogEntry.systemDebug(`Inserting object ${JSON.stringify(objectsToInsert)} into table ${tableName}`, blockHeight);
                  // await this.writeLog(insertLogEntry, logEntries, functionName);
                  // Call insert with parameters
                  return await dmlHandler.insert(schemaName, tableDefinitionNames, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert]);
                } finally {
                  insertSpan.end();
                }
              });
            },
            select: async (filterObj: any, limit = null) => {
              return await this.tracer.startActiveSpan('Call context db select', async (selectSpan: Span) => {
                try {
                  // Write log before calling select
                  await this.writeLog(LogLevel.DEBUG, functionName, blockHeight,
                    `Selecting objects in table ${tableName} with values ${JSON.stringify(filterObj)} with ${limit === null ? 'no' : limit} limit`);
                  // const selectLogEntry = LogEntry.systemDebug(`Selecting objects in table ${tableName} with values ${JSON.stringify(filterObj)} with ${limit === null ? 'no' : limit} limit`, blockHeight);
                  // await this.writeLog(selectLogEntry, logEntries, functionName);
                  // Call select with parameters
                  return await dmlHandler.select(schemaName, tableDefinitionNames, filterObj, limit);
                } finally {
                  selectSpan.end();
                }
              });
            },
            update: async (filterObj: any, updateObj: any) => {
              return await this.tracer.startActiveSpan('Call context db update', async (updateSpan: Span) => {
                try {
                  // Write log before calling update
                  await this.writeLog(LogLevel.DEBUG, functionName, blockHeight,
                    `Updating objects in table ${tableName} that match ${JSON.stringify(filterObj)} with values ${JSON.stringify(updateObj)}`);
                  // const updateLogEntry = LogEntry.systemDebug(`Updating objects in table ${tableName} that match ${JSON.stringify(filterObj)} with values ${JSON.stringify(updateObj)}`, blockHeight);
                  // await this.writeLog(updateLogEntry, logEntries, functionName);
                  // Call update with parameters
                  return await dmlHandler.update(schemaName, tableDefinitionNames, filterObj, updateObj);
                } finally {
                  updateSpan.end();
                }
              });
            },
            upsert: async (objectsToInsert: any, conflictColumns: string[], updateColumns: string[]) => {
              return await this.tracer.startActiveSpan('Call context db upsert', async (upsertSpan: Span) => {
                try {
                  // Write log before calling upsert
                  await this.writeLog(LogLevel.DEBUG, functionName, blockHeight,
                    `Inserting objects into table ${tableName} with values ${JSON.stringify(objectsToInsert)}. Conflict on columns ${conflictColumns.join(', ')} will update values in columns ${updateColumns.join(', ')}`);
                  // const upsertLogEntry = LogEntry.systemDebug(`Inserting objects into table ${tableName} with values ${JSON.stringify(objectsToInsert)}. Conflict on columns ${conflictColumns.join(', ')} will update values in columns ${updateColumns.join(', ')}`, blockHeight);
                  // await this.writeLog(upsertLogEntry, logEntries, functionName);
                  // Call upsert with parameters
                  return await dmlHandler.upsert(schemaName, tableDefinitionNames, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert], conflictColumns, updateColumns);
                } finally {
                  upsertSpan.end();
                }
              });
            },
            delete: async (filterObj: any) => {
              return await this.tracer.startActiveSpan('Call context db delete', async (deleteSpan: Span) => {
                try {
                  // Write log before calling delete
                  await this.writeLog(LogLevel.DEBUG, functionName, blockHeight,
                    `Deleting objects from table ${tableName} with values ${JSON.stringify(filterObj)}`);
                  // const deleteLogEntry = LogEntry.systemDebug(`Deleting objects from table ${tableName} with values ${JSON.stringify(filterObj)}`, blockHeight);
                  // await this.writeLog(deleteLogEntry, logEntries, functionName);
                  // Call delete with parameters
                  return await dmlHandler.delete(schemaName, tableDefinitionNames, filterObj);
                } finally {
                  deleteSpan.end();
                }
              });
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
      const errorContent = error as { message: string, location: Record<string, any> };
      console.warn(`${functionName}: Caught error when generating context.db methods. Building no functions. You can still use other context object methods.\nError: ${errorContent.message}\nLocation: `, errorContent.location);
    }
    return {}; // Default to empty object if error
  }

  async setStatus (functionName: string, blockHeight: number, status: IndexerStatus): Promise<any> {
    if (this.currentStatus === status) {
      return;
    }

    this.currentStatus = status;

    const setStatusMutation = `
      mutation SetStatus($function_name: String, $status: String) {
        insert_indexer_state_one(object: {function_name: $function_name, status: $status, current_block_height: 0 }, on_conflict: { constraint: indexer_state_pkey, update_columns: status }) {
          function_name
          status
        }
      }`;
    const setStatusSpan = this.tracer.startSpan(`set status of indexer to ${status} through hasura`);
    try {
      await this.runGraphQLQuery(
        setStatusMutation,
        {
          function_name: functionName,
          status,
        },
        functionName,
        blockHeight,
        this.DEFAULT_HASURA_ROLE
      );
    } finally {
      setStatusSpan.end();
    }

    await this.indexer_logger?.updateIndexerStatus(status);
  }

  // async writeLog (logEntry: LogEntry, logEntries: LogEntry[], functionName: string): Promise<any> {
  //   logEntries.push(logEntry);
  //   const { logLevel, blockHeight, message } = logEntry;
  //   return await this.writeLogOld(logLevel, functionName, blockHeight, message);
  // }

  // async callWriteLog (logEntry: LogEntry): Promise<any> {
  //   await (this.deps.indexerMeta as IndexerMeta).writeLogs([logEntry]);
  // }

  async updateIndexerBlockHeight (functionName: string, blockHeight: number, isHistorical: boolean): Promise<void> {
    const realTimeMutation: string = `
      mutation WriteBlock($function_name: String!, $block_height: numeric!) {
        insert_indexer_state(
          objects: {current_block_height: $block_height, function_name: $function_name}
          on_conflict: {constraint: indexer_state_pkey, update_columns: current_block_height}
        ) {
          returning {
            current_block_height
            function_name
          }
        }
      }`;
    const historicalMutation: string = `
      mutation WriteBlock($function_name: String!, $block_height: numeric!) {
        insert_indexer_state(
          objects: {current_historical_block_height: $block_height, current_block_height: 0, function_name: $function_name}
          on_conflict: {constraint: indexer_state_pkey, update_columns: current_historical_block_height}
        ) {
          returning {
            current_block_height
            current_historical_block_height
            function_name
          }
        }
      }
    `;
    const variables: any = {
      function_name: functionName,
      block_height: blockHeight,
    };
    const setBlockHeightSpan = this.tracer.startSpan('set last processed block height through Hasura');
    try {
      await this.runGraphQLQuery(isHistorical ? historicalMutation : realTimeMutation, variables, functionName, blockHeight, this.DEFAULT_HASURA_ROLE)
        .catch((e: any) => {
          console.error(`${functionName}: Error writing function state`, e);
        });
    } finally {
      setBlockHeightSpan.end();
    }

    await this.indexer_logger?.updateIndexerBlockheight(blockHeight);
  }

  // todo rename to writeLogOld
  async writeLog (logLevel: LogLevel, functionName: string, blockHeight: number, ...message: any[]): Promise<any> {
    if (logLevel < this.indexer_behavior.log_level) {
      return;
    }

    const logMutation = `
      mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){
          insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {id}
      }`;

    const writeLogSpan = this.tracer.startSpan('Write log to log table through Hasura');
    const parsedMessage: string = message
      .map(m => typeof m === 'object' ? JSON.stringify(m) : m)
      .join(':');

    return await this.runGraphQLQuery(logMutation, { function_name: functionName, block_height: blockHeight, message: parsedMessage },
      functionName, blockHeight, this.DEFAULT_HASURA_ROLE)
      .then((result: any) => {
        return result?.insert_indexer_log_entries_one?.returning?.[0]?.id;
      })
      .catch((e: any) => {
        console.error('Error writing log to in writeLogOld Function', e);
      })
      .finally(() => {
        writeLogSpan.end();
      });
  }

  async runGraphQLQuery (operation: string, variables: any, functionName: string, blockHeight: number, hasuraRoleName: string | null, logError: boolean = true): Promise<any> {
    console.log('runGraphQLQuery', operation, variables, functionName, blockHeight, hasuraRoleName, logError);
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
          await this.runGraphQLQuery(mutation, { function_name: functionName, block_height: blockHeight, message }, functionName, blockHeight, this.DEFAULT_HASURA_ROLE, false);
        } catch (e) {
          console.error(`${functionName}: Error writing log of graphql error`, e);
        }
      }
      throw new Error(`Failed to write graphql, http status: ${response.status}, errors: ${JSON.stringify(errors, null, 2)}`);
    }

    return data;
  }
}
