import fetch, { type Response } from 'node-fetch';
import { VM } from 'vm2';
import { type Block } from '@near-lake/primitives';
import { Parser } from 'node-sql-parser';

import Provisioner from '../provisioner';
import DmlHandler from '../dml-handler/dml-handler';
import { string } from 'pg-format';

interface Dependencies {
  fetch: typeof fetch
  provisioner: Provisioner
  DmlHandler: typeof DmlHandler
  parser: Parser
};

interface Context {
  graphql: (operation: string, variables?: Record<string, any>) => Promise<any>
  set: (key: string, value: any) => Promise<any>
  log: (...log: any[]) => Promise<void>
  fetchFromSocialApi: (path: string, options?: any) => Promise<any>
  db: Record<string, Record<string, (...args: any[]) => any>>
}

interface IndexerFunction {
  account_id: string
  function_name: string
  provisioned?: boolean
  schema: string
  code: string
}

export default class Indexer {
  DEFAULT_HASURA_ROLE;

  private readonly deps: Dependencies;

  constructor (
    deps?: Partial<Dependencies>
  ) {
    this.DEFAULT_HASURA_ROLE = 'append';
    this.deps = {
      fetch,
      provisioner: new Provisioner(),
      DmlHandler,
      parser: new Parser(),
      ...deps,
    };
  }

  async runFunctions (
    block: Block,
    functions: Record<string, IndexerFunction>,
    isHistorical: boolean,
    options: { provision?: boolean } = { provision: false }
  ): Promise<string[]> {
    const blockHeight = block.blockHeight;

    const lag = Date.now() - Math.floor(Number(block.header().timestampNanosec) / 1000000);

    const simultaneousPromises: Array<Promise<any>> = [];
    const allMutations: string[] = [];

    for (const functionName in functions) {
      try {
        const indexerFunction = functions[functionName];

        const runningMessage = `Running function ${functionName} on block ${blockHeight}` + (isHistorical ? ' historical backfill' : `, lag is: ${lag?.toString()}ms from block timestamp`);
        console.log(runningMessage); // Print the running message to the console

        simultaneousPromises.push(this.writeLog(functionName, blockHeight, runningMessage));

        const hasuraRoleName = functionName.split('/')[0].replace(/[.-]/g, '_');

        if (options.provision && !indexerFunction.provisioned) {
          try {
            if (!await this.deps.provisioner.isUserApiProvisioned(indexerFunction.account_id, indexerFunction.function_name)) {
              await this.setStatus(functionName, blockHeight, 'PROVISIONING');
              simultaneousPromises.push(this.writeLog(functionName, blockHeight, 'Provisioning endpoint: starting'));

              await this.deps.provisioner.provisionUserApi(indexerFunction.account_id, indexerFunction.function_name, indexerFunction.schema);

              simultaneousPromises.push(this.writeLog(functionName, blockHeight, 'Provisioning endpoint: successful'));
            }
          } catch (e) {
            const error = e as Error;
            simultaneousPromises.push(this.writeLog(functionName, blockHeight, 'Provisioning endpoint: failure', error.message));
            throw error;
          }
        }

        await this.setStatus(functionName, blockHeight, 'RUNNING');
        const vm = new VM({ timeout: 3000, allowAsync: true });
        const context = this.buildContext(indexerFunction.schema, functionName, blockHeight, hasuraRoleName);

        vm.freeze(block, 'block');
        vm.freeze(context, 'context');
        vm.freeze(context, 'console'); // provide console.log via context.log

        const modifiedFunction = this.transformIndexerFunction(indexerFunction.code);
        try {
          await vm.run(modifiedFunction);
        } catch (e) {
          const error = e as Error;
          // NOTE: logging the exception would likely leak some information about the index runner.
          // For now, we just log the message. In the future we could sanitize the stack trace
          // and give the correct line number offsets within the indexer function
          console.error(`${functionName}: Error running IndexerFunction on block ${blockHeight}: ${error.message}`);
          await this.writeLog(functionName, blockHeight, 'Error running IndexerFunction', error.message);
          throw e;
        }
        simultaneousPromises.push(this.writeFunctionState(functionName, blockHeight, isHistorical));
      } catch (e) {
        console.error(`${functionName}: Failed to run function`, e);
        await this.setStatus(functionName, blockHeight, 'STOPPED');
        throw e;
      } finally {
        await Promise.all(simultaneousPromises);
      }
    }
    return allMutations;
  }

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

  buildContext (schema: string, functionName: string, blockHeight: number, hasuraRoleName: string): Context {
    const account = functionName.split('/')[0].replace(/[.-]/g, '_');
    const functionNameWithoutAccount = functionName.split('/')[1].replace(/[.-]/g, '_');
    const schemaName = functionName.replace(/[^a-zA-Z0-9]/g, '_');

    return {
      graphql: async (operation, variables) => {
        console.log(`${functionName}: Running context graphql`, operation);
        return await this.runGraphQLQuery(operation, variables, functionName, blockHeight, hasuraRoleName);
      },
      set: async (key, value) => {
        const mutation =
                    `mutation SetKeyValue($function_name: String!, $key: String!, $value: String!) {
                        insert_${hasuraRoleName}_${functionNameWithoutAccount}_indexer_storage_one(object: {function_name: $function_name, key_name: $key, value: $value} on_conflict: {constraint: indexer_storage_pkey, update_columns: value}) {key_name}
                     }`;
        const variables = {
          function_name: functionName,
          key,
          value: value ? JSON.stringify(value) : null
        };
        console.log(`${functionName}: Running set:`, mutation, variables);
        return await this.runGraphQLQuery(mutation, variables, functionName, blockHeight, hasuraRoleName);
      },
      log: async (...log) => {
        return await this.writeLog(functionName, blockHeight, ...log);
      },
      fetchFromSocialApi: async (path, options) => {
        return await this.deps.fetch(`https://api.near.social${path}`, options);
      },
      db: this.buildDatabaseContext(account, schemaName, schema, blockHeight)
    };
  }

  extractCreateTableStatements (schema: string): string[] {
    const regex = /CREATE TABLE\s+.*?;\s*/gs;
    let match;
    const statements = [];

    while ((match = regex.exec(schema)) !== null) {
      statements.push(match[0]);
    }

    return statements;
  }

  findIdentifier (ddl: string, startIndex: number, keyword: string): { foundKeyword: string, endIndex: number } | null {
    const searchablePart = ddl.substring(startIndex);

    // Regex to find the keyword (with optional quotes)
    const regex = new RegExp(`"?${keyword}"?`, 'i');
    const match = regex.exec(searchablePart);

    if (match) {
      return {
        foundKeyword: match[0], // Keyword including quotes
        endIndex: startIndex + match.index + match[0].length // Adjusted index of the end of the keyword
      };
    } else {
      return null;
    }
  }

  getTableAndColumnNames (schema: string): Map<string, Set<string>> {
    const startTime = performance.now();
    const tableAndColumns = new Map<string, Set<string>>();
    const createTableStatements = this.extractCreateTableStatements(schema);
    const otherStart = performance.now();
    let schemaSyntaxTree = this.deps.parser.astify(schema, { database: 'Postgresql' });
    const astTime = performance.now() - otherStart;
    schemaSyntaxTree = Array.isArray(schemaSyntaxTree) ? schemaSyntaxTree : [schemaSyntaxTree]; // Ensure iterable
    const tableNames = new Set<string>();

    // Collect all table names from schema AST, throw error if duplicate table names exist
    let createTableStatementIndex = 0;
    for (const statement of schemaSyntaxTree) {
      if (statement.type === 'create' && statement.keyword === 'table' && statement.table !== undefined) {
        let startIndex = 0;
        const statementString = createTableStatements[createTableStatementIndex++];
        const tableSearch = this.findIdentifier(statementString, startIndex, statement.table[0].table);
        if (tableSearch === null) {
          throw new Error(`Could not find table name ${statement.table[0].table} in schema.`);
        }

        const tableName = tableSearch.foundKeyword;
        startIndex = tableSearch.endIndex;

        if (tableNames.has(tableName)) {
          throw new Error(`Table ${tableName} already exists in schema. Table names must be unique.`);
        }

        tableAndColumns.set(tableName, new Set<string>());

        for (const columnStatement of statement.create_definitions ?? []) {
          console.log(columnStatement);
          if (columnStatement.column?.column !== undefined) {
            const columnSearch = this.findIdentifier(schema, startIndex, columnStatement.column.column);
            if (columnSearch === null) {
              throw new Error(`Could not find column name ${columnStatement.column.column as string} for table ${tableName} in schema.`);
            }
            const columnName = columnSearch.foundKeyword;
            startIndex = columnSearch.endIndex;

            if (tableAndColumns.get(tableName)?.has(columnName)) {
              throw new Error(`Column ${columnName} already exists in table ${tableName}. Column names must be unique.`);
            }

            tableAndColumns.get(tableName)?.add(columnName);
          }
        }
      }
    }

    console.log(`getTableAndColumnNames took additional ${performance.now() - startTime - astTime}ms, total was ${performance.now() - startTime}ms`);
    return tableAndColumns;
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

  buildDatabaseContext (account: string, schemaName: string, schema: string, blockHeight: number): Record<string, Record<string, (...args: any[]) => any>> {
    try {
      const tableAndColumnNames = this.getTableAndColumnNames(schema);
      const tables = Array.from(tableAndColumnNames.keys());
      const sanitizedTableNames = new Set<string>();
      const dmlHandlerLazyLoader: Promise<DmlHandler> = this.deps.DmlHandler.create(account);

      // Generate and collect methods for each table name
      const result = tables.reduce((prev, tableName) => {
        // Generate sanitized table name and ensure no conflict
        const sanitizedTableName = this.sanitizeTableName(tableName);
        if (sanitizedTableNames.has(sanitizedTableName)) {
          throw new Error(`Table ${tableName} has the same sanitized name as another table. Special characters are removed to generate context.db methods. Please rename the table.`);
        } else {
          sanitizedTableNames.add(sanitizedTableName);
        }

        // Generate context.db methods for table
        const defaultLog = `Calling context.db.${sanitizedTableName}.`;
        const funcForTable = {
          [`${sanitizedTableName}`]: {
            insert: async (objectsToInsert: any) => {
              // Write log before calling insert
              await this.writeLog(`context.db.${sanitizedTableName}.insert`, blockHeight, defaultLog + '.insert',
                `Inserting object ${JSON.stringify(objectsToInsert)} into table ${tableName} on schema ${schemaName}`);

              // Wait for initialiiation of DmlHandler
              const dmlHandler = await dmlHandlerLazyLoader;

              // Call insert with parameters
              return await dmlHandler.insert(schemaName, tableName, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert]);
            },
            select: async (filterObj: any, limit = null) => {
              // Write log before calling select
              await this.writeLog(`context.db.${sanitizedTableName}.select`, blockHeight, defaultLog + '.select',
                `Selecting objects with values ${JSON.stringify(filterObj)} in table ${tableName} on schema ${schemaName} with ${limit === null ? 'no' : limit} limit`);

              // Wait for initialiiation of DmlHandler
              const dmlHandler = await dmlHandlerLazyLoader;

              // Call select with parameters
              return await dmlHandler.select(schemaName, tableName, filterObj, limit);
            },
            update: async (filterObj: any, updateObj: any) => {
              // Write log before calling update
              await this.writeLog(`context.db.${sanitizedTableName}.update`, blockHeight, defaultLog + '.update',
                `Updating objects that match ${JSON.stringify(filterObj)} with values ${JSON.stringify(updateObj)} in table ${tableName} on schema ${schemaName}`);

              // Wait for initialiiation of DmlHandler
              const dmlHandler = await dmlHandlerLazyLoader;

              // Call update with parameters
              return await dmlHandler.update(schemaName, tableName, filterObj, updateObj);
            },
            upsert: async (objectsToInsert: any, conflictColumns: string[], updateColumns: string[]) => {
              // Write log before calling upsert
              await this.writeLog(`context.db.${sanitizedTableName}.upsert`, blockHeight, defaultLog + '.upsert',
                `Inserting objects with values ${JSON.stringify(objectsToInsert)} into table ${tableName} on schema ${schemaName}. Conflict on columns ${conflictColumns.join(', ')} will update values in columns ${updateColumns.join(', ')}`);

              // Wait for initialiiation of DmlHandler
              const dmlHandler = await dmlHandlerLazyLoader;

              // Call upsert with parameters
              return await dmlHandler.upsert(schemaName, tableName, Array.isArray(objectsToInsert) ? objectsToInsert : [objectsToInsert], conflictColumns, updateColumns);
            },
            delete: async (filterObj: any) => {
              // Write log before calling delete
              await this.writeLog(`context.db.${sanitizedTableName}.delete`, blockHeight, defaultLog + '.delete',
                `Deleting objects with values ${JSON.stringify(filterObj)} from table ${tableName} on schema ${schemaName}`);

              // Wait for initialiiation of DmlHandler
              const dmlHandler = await dmlHandlerLazyLoader;

              // Call delete with parameters
              return await dmlHandler.delete(schemaName, tableName, filterObj);
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
      console.warn('Caught error when generating context.db methods. Building no functions. You can still use other context object methods.\n', error);
    }

    return {}; // Default to empty object if error
  }

  async setStatus (functionName: string, blockHeight: number, status: string): Promise<any> {
    return await this.runGraphQLQuery(
            `
                mutation SetStatus($function_name: String, $status: String) {
                  insert_indexer_state_one(object: {function_name: $function_name, status: $status, current_block_height: 0 }, on_conflict: { constraint: indexer_state_pkey, update_columns: status }) {
                    function_name
                    status
                  }
                }
            `,
            {
              function_name: functionName,
              status,
            },
            functionName,
            blockHeight,
            this.DEFAULT_HASURA_ROLE
    );
  }

  async writeLog (functionName: string, blockHeight: number, ...message: any[]): Promise<any> {
    const parsedMessage: string = message
      .map(m => typeof m === 'object' ? JSON.stringify(m) : m)
      .join(':');

    const mutation =
            `mutation writeLog($function_name: String!, $block_height: numeric!, $message: String!){
                insert_indexer_log_entries_one(object: {function_name: $function_name, block_height: $block_height, message: $message}) {id}
             }`;

    return await this.runGraphQLQuery(mutation, { function_name: functionName, block_height: blockHeight, message: parsedMessage },
      functionName, blockHeight, this.DEFAULT_HASURA_ROLE)
      .then((result: any) => {
        return result?.insert_indexer_log_entries_one?.id;
      })
      .catch((e: any) => {
        console.error(`${functionName}: Error writing log`, e);
      });
  }

  async writeFunctionState (functionName: string, blockHeight: number, isHistorical: boolean): Promise<any> {
    const realTimeMutation: string =
            `mutation WriteBlock($function_name: String!, $block_height: numeric!) {
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
    return await this.runGraphQLQuery(isHistorical ? historicalMutation : realTimeMutation, variables, functionName, blockHeight, this.DEFAULT_HASURA_ROLE)
      .catch((e: any) => {
        console.error(`${functionName}: Error writing function state`, e);
      });
  }

  async runGraphQLQuery (operation: string, variables: any, functionName: string, blockHeight: number, hasuraRoleName: string | null, logError: boolean = true): Promise<any> {
    const response: Response = await this.deps.fetch(`${process.env.HASURA_ENDPOINT}/v1/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hasura-Use-Backend-Only-Permissions': 'true',
        ...(hasuraRoleName && {
          'X-Hasura-Role': hasuraRoleName,
          'X-Hasura-Admin-Secret': process.env.HASURA_ADMIN_SECRET
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
        console.log(`${functionName}: Error writing graphql `, errors); // temporary extra logging

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
