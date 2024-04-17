import fetch, { type Response } from 'node-fetch';
import { VM } from 'vm2';
import * as lakePrimitives from '@near-lake/primitives';
import { Parser } from 'node-sql-parser';

import Provisioner from '../provisioner';
import DmlHandler from '../dml-handler/dml-handler';
import LogEntry, { LogLevel } from '../indexer-meta/log-entry';

import { trace, type Span } from '@opentelemetry/api';
import type IndexerConfig from '../indexer-config';
import { type PostgresConnectionParams } from '../pg-client';
import IndexerMeta, { IndexerStatus } from '../indexer-meta';

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

interface Config {
  hasuraAdminSecret: string
  hasuraEndpoint: string
}

const defaultConfig: Config = {
  hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET,
  hasuraEndpoint: process.env.HASURA_ENDPOINT,
};

export default class Indexer {
  DEFAULT_HASURA_ROLE: string;
  IS_FIRST_EXECUTION: boolean = false;
  tracer = trace.getTracer('queryapi-runner-indexer');

  private readonly deps: Dependencies;

  private database_connection_parameters: PostgresConnectionParams | undefined;

  private currentStatus?: string;

  constructor (
    private readonly indexerConfig: IndexerConfig,
    deps?: Partial<Dependencies>,
    databaseConnectionParameters: PostgresConnectionParams | undefined = undefined,
    private readonly config: Config = defaultConfig,
  ) {
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
    block: lakePrimitives.Block
  ): Promise<string[]> {
    const blockHeight: number = block.blockHeight;

    const lag = Date.now() - Math.floor(Number(block.header().timestampNanosec) / 1000000);

    const simultaneousPromises: Array<Promise<any>> = [];
    const allMutations: string[] = [];
    const logEntries: LogEntry[] = [];

    try {
      const runningMessage = `Running function ${this.indexerConfig.fullName()} on block ${blockHeight}, lag is: ${lag?.toString()}ms from block timestamp`;
      simultaneousPromises.push(this.writeLogOld(LogLevel.INFO, blockHeight, runningMessage));

      try {
        if (!await this.deps.provisioner.fetchUserApiProvisioningStatus(this.indexerConfig)) {
          await this.setStatus(blockHeight, IndexerStatus.PROVISIONING);
          simultaneousPromises.push(this.writeLogOld(LogLevel.INFO, blockHeight, 'Provisioning endpoint: starting'));
          const provisionStartLogEntry = LogEntry.systemInfo('Provisioning endpoint: starting', blockHeight);
          logEntries.push(provisionStartLogEntry);
          await this.deps.provisioner.provisionUserApi(this.indexerConfig);
          simultaneousPromises.push(this.writeLogOld(LogLevel.INFO, blockHeight, 'Provisioning endpoint: successful'));
          const provisionSuccessLogEntry = LogEntry.systemInfo('Provisioning endpoint: successful', blockHeight);
          logEntries.push(provisionSuccessLogEntry);
        }
        await this.deps.provisioner.provisionLogsIfNeeded(this.indexerConfig);
        await this.deps.provisioner.provisionMetadataIfNeeded(this.indexerConfig);
      } catch (e) {
        const error = e as Error;
        simultaneousPromises.push(this.writeLogOld(LogLevel.ERROR, blockHeight, `Provisioning endpoint: failure:${error.message}`));
        const provisionFailureLogEntry = LogEntry.systemError('Provisioning endpoint: failure', blockHeight);
        logEntries.push(provisionFailureLogEntry);
        throw error;
      }

      const runningLogEntry = LogEntry.systemInfo(runningMessage, blockHeight);
      logEntries.push(runningLogEntry);
      // Cache database credentials after provisioning
      const credentialsFetchSpan = this.tracer.startSpan('fetch database connection parameters');
      try {
        this.database_connection_parameters ??= await this.deps.provisioner.getPgBouncerConnectionParameters(this.indexerConfig.hasuraRoleName());
        this.deps.indexerMeta ??= new IndexerMeta(this.indexerConfig, this.database_connection_parameters);
        this.deps.dmlHandler ??= new DmlHandler(this.database_connection_parameters);
      } catch (e) {
        const error = e as Error;
        await this.writeLogOld(LogLevel.ERROR, blockHeight, 'Failed to get database connection parameters', error.message);
        const databaseErrorLogEntry = LogEntry.systemError('Failed to get database connection parameters', blockHeight);
        logEntries.push(databaseErrorLogEntry);
        throw error;
      } finally {
        credentialsFetchSpan.end();
      }

      const resourceCreationSpan = this.tracer.startSpan('prepare vm and context to run indexer code');
      simultaneousPromises.push(this.setStatus(blockHeight, IndexerStatus.RUNNING));
      const vm = new VM({ allowAsync: true });
      const context = this.buildContext(blockHeight, logEntries);

      vm.freeze(block, 'block');
      vm.freeze(lakePrimitives, 'primitives');
      vm.freeze(context, 'context');
      vm.freeze(context, 'console'); // provide console.log via context.log
      resourceCreationSpan.end();

      await this.tracer.startActiveSpan('run indexer code', async (runIndexerCodeSpan: Span) => {
        try {
          const transformedCode = this.transformIndexerFunction();
          await vm.run(transformedCode);
        } catch (e) {
          const error = e as Error;
          simultaneousPromises.push(this.writeLogOld(LogLevel.ERROR, blockHeight, 'Error running IndexerFunction', error.message));
          const indexerErrorLogEntry = LogEntry.systemError('Error running IndexerFunction', blockHeight);
          logEntries.push(indexerErrorLogEntry);
          throw e;
        } finally {
          runIndexerCodeSpan.end();
        }
      });
      simultaneousPromises.push(this.updateIndexerBlockHeight(blockHeight));
    } catch (e) {
      // TODO: Prevent unnecesary reruns of set status
      await this.setStatus(blockHeight, IndexerStatus.FAILING);
      throw e;
    } finally {
      await Promise.all([...simultaneousPromises, (this.deps.indexerMeta as IndexerMeta).writeLogs(logEntries)]);
    }
    return allMutations;
  }

  buildContext (blockHeight: number, logEntries: LogEntry[]): Context {
    return {
      graphql: async (operation, variables) => {
        const graphqlSpan = this.tracer.startSpan(`Call graphql ${operation.includes('mutation') ? 'mutation' : 'query'} through Hasura`);
        try {
          return await this.runGraphQLQuery(operation, variables, blockHeight, this.indexerConfig.hasuraRoleName());
        } finally {
          graphqlSpan.end();
        }
      },
      set: async (key, value) => {
        const setSpan = this.tracer.startSpan('Call insert mutation through Hasura');
        const mutation = `
          mutation SetKeyValue($function_name: String!, $key: String!, $value: String!) {
            insert_${this.indexerConfig.hasuraRoleName()}_${this.indexerConfig.hasuraRoleName()}_indexer_storage_one(object: {function_name: $function_name, key_name: $key, value: $value} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}
          }`;
        const variables = {
          function_name: this.indexerConfig.fullName(),
          key,
          value: value ? JSON.stringify(value) : null
        };
        try {
          return await this.runGraphQLQuery(mutation, variables, blockHeight, this.indexerConfig.hasuraRoleName());
        } finally {
          setSpan.end();
        }
      },
      debug: async (...log) => {
        const debugLogEntry = LogEntry.systemDebug(log.join(' '), blockHeight);
        return await this.writeLog(debugLogEntry, logEntries);
      },
      log: async (...log) => {
        const infoLogEntry = LogEntry.systemInfo(log.join(' '), blockHeight);
        return await this.writeLog(infoLogEntry, logEntries);
      },
      warn: async (...log) => {
        const warnLogEntry = LogEntry.systemWarn(log.join(' '), blockHeight);
        return await this.writeLog(warnLogEntry, logEntries);
      },
      error: async (...log) => {
        const errorLogEntry = LogEntry.systemError(log.join(' '), blockHeight);
        return await this.writeLog(errorLogEntry, logEntries);
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
              return await this.tracer.startActiveSpan('Call context db insert', async (insertSpan: Span) => {
                try {
                  // Write log before calling insert
                  const insertLogEntry = LogEntry.userDebug(`Inserting object ${JSON.stringify(objectsToInsert)} into table ${tableName}`, blockHeight);
                  await this.writeLog(insertLogEntry, logEntries);
                  // Call insert with parameters
                  return await dmlHandler.insert(this.indexerConfig.schemaName(), tableDefinitionNames, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert]);
                } finally {
                  insertSpan.end();
                }
              });
            },
            select: async (filterObj: any, limit = null) => {
              return await this.tracer.startActiveSpan('Call context db select', async (selectSpan: Span) => {
                try {
                  // Write log before calling select
                  const selectLogEntry = LogEntry.userDebug(`Selecting objects in table ${tableName} with values ${JSON.stringify(filterObj)} with ${limit === null ? 'no' : limit} limit`, blockHeight);
                  await this.writeLog(selectLogEntry, logEntries);
                  // Call select with parameters
                  return await dmlHandler.select(this.indexerConfig.schemaName(), tableDefinitionNames, filterObj, limit);
                } finally {
                  selectSpan.end();
                }
              });
            },
            update: async (filterObj: any, updateObj: any) => {
              return await this.tracer.startActiveSpan('Call context db update', async (updateSpan: Span) => {
                try {
                  // Write log before calling update
                  const updateLogEntry = LogEntry.userDebug(`Updating objects in table ${tableName} that match ${JSON.stringify(filterObj)} with values ${JSON.stringify(updateObj)}`, blockHeight);
                  await this.writeLog(updateLogEntry, logEntries);
                  // Call update with parameters
                  return await dmlHandler.update(this.indexerConfig.schemaName(), tableDefinitionNames, filterObj, updateObj);
                } finally {
                  updateSpan.end();
                }
              });
            },
            upsert: async (objectsToInsert: any, conflictColumns: string[], updateColumns: string[]) => {
              return await this.tracer.startActiveSpan('Call context db upsert', async (upsertSpan: Span) => {
                try {
                  // Write log before calling upsert
                  const upsertLogEntry = LogEntry.userDebug(`Inserting objects into table ${tableName} with values ${JSON.stringify(objectsToInsert)}. Conflict on columns ${conflictColumns.join(', ')} will update values in columns ${updateColumns.join(', ')}`, blockHeight);
                  await this.writeLog(upsertLogEntry, logEntries);
                  // Call upsert with parameters
                  return await dmlHandler.upsert(this.indexerConfig.schemaName(), tableDefinitionNames, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert], conflictColumns, updateColumns);
                } finally {
                  upsertSpan.end();
                }
              });
            },
            delete: async (filterObj: any) => {
              return await this.tracer.startActiveSpan('Call context db delete', async (deleteSpan: Span) => {
                try {
                  // Write log before calling delete
                  const deleteLogEntry = LogEntry.userDebug(`Deleting objects from table ${tableName} with values ${JSON.stringify(filterObj)}`, blockHeight);
                  await this.writeLog(deleteLogEntry, logEntries);
                  // Call delete with parameters
                  return await dmlHandler.delete(this.indexerConfig.schemaName(), tableDefinitionNames, filterObj);
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
      if (!this.IS_FIRST_EXECUTION) {
        console.warn(`${this.indexerConfig.fullName()}: Caught error when generating context.db methods. Building no functions. You can still use other context object methods.\nError: ${errorContent.message}\nLocation: `, errorContent.location);
        this.IS_FIRST_EXECUTION = true;
      }
    }
    return {}; // Default to empty object if error
  }

  async setStatus (blockHeight: number, status: IndexerStatus): Promise<any> {
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
          function_name: this.indexerConfig.fullName(),
          status,
        },
        blockHeight,
        this.DEFAULT_HASURA_ROLE
      );
    } finally {
      setStatusSpan.end();
    }

    // Metadata table possibly unprovisioned when called, so I am not validating indexerMeta yet
    await this.deps.indexerMeta?.setStatus(status);
  }

  async writeLog (logEntry: LogEntry, logEntries: LogEntry[]): Promise<any> {
    logEntries.push(logEntry);
    const { level, blockHeight, message } = logEntry;
    if (blockHeight) {
      return await this.writeLogOld(level, blockHeight, message);
    }
  }

  private async createIndexerMetaIfNotExists (failureMessage: string): Promise<void> {
    if (!this.deps.indexerMeta) {
      try {
        this.database_connection_parameters ??= await this.deps.provisioner.getPgBouncerConnectionParameters(this.indexerConfig.hasuraRoleName());
        this.deps.indexerMeta = new IndexerMeta(this.indexerConfig, this.database_connection_parameters);
      } catch (e) {
        const error = e as Error;
        console.error(failureMessage, e);
        throw error;
      }
    }
  }

  async setStoppedStatus (): Promise<void> {
    await this.createIndexerMetaIfNotExists(`${this.indexerConfig.fullName()}: Failed to get DB params to set status STOPPED for stream`);
    const indexerMeta: IndexerMeta = this.deps.indexerMeta as IndexerMeta;
    await indexerMeta.setStatus(IndexerStatus.STOPPED);
  }

  // onetime use method to allow stream-handler to writeLog into new log table in case of failure
  async callWriteLog (logEntry: LogEntry): Promise<void> {
    await this.createIndexerMetaIfNotExists(`${this.indexerConfig.fullName()}: Failed to get DB params to write crashed worker error log for stream`);
    const indexerMeta: IndexerMeta = this.deps.indexerMeta as IndexerMeta;
    await indexerMeta.writeLogs([logEntry]);
  }

  async updateIndexerBlockHeight (blockHeight: number): Promise<void> {
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
    const variables: any = {
      function_name: this.indexerConfig.fullName(),
      block_height: blockHeight,
    };
    const setBlockHeightSpan = this.tracer.startSpan('set last processed block height through Hasura');
    try {
      await this.runGraphQLQuery(realTimeMutation, variables, blockHeight, this.DEFAULT_HASURA_ROLE)
        .catch((e: any) => {
          console.error(`${this.indexerConfig.fullName()}: Error writing function state`, e);
        });
    } finally {
      setBlockHeightSpan.end();
    }

    await (this.deps.indexerMeta as IndexerMeta).updateBlockHeight(blockHeight);
  }

  // todo rename to writeLogOld
  async writeLogOld (logLevel: LogLevel, blockHeight: number, ...message: any[]): Promise<any> {
    if (logLevel < this.indexerConfig.logLevel) {
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

    return await this.runGraphQLQuery(logMutation, { function_name: this.indexerConfig.fullName(), block_height: blockHeight, message: parsedMessage },
      blockHeight, this.DEFAULT_HASURA_ROLE)
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
          console.error(`${this.indexerConfig.fullName()}: Error writing log of graphql error`, e);
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
