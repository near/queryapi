import type { Schema } from 'genson-js/dist/types';

import type { Event, Method } from '@/pages/api/generateCode';

export interface GeneratedCode {
  jsCode: string;
  sqlCode: string;
}

interface Column {
  name: string;
  sql: string;
}

function sanitizeTableName(tableName: string): string {
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

const createColumn = (columnName: string, schema: Schema): Column => {
  let type: string;
  switch (schema.type) {
    case 'string':
      type = 'TEXT';
      break;
    case 'integer':
      type = 'INT';
      break;
    case 'number':
      type = 'FLOAT';
      break;
    case 'boolean':
      type = 'BOOLEAN';
      break;
    case 'array':
      type = 'TEXT[]';
      break;
    case 'object':
      type = 'JSONB';
      break;
    default:
      type = 'TEXT';
  }
  return { name: columnName, sql: `"${columnName}" ${type}` };
};

export class WizardCodeGenerator {
  constructor(private contractFilter: string, private selectedMethods: Method[], private selectedEvents?: Event[]) {}

  private getColumns(method: Method): Column[] {
    if (!method.schema.properties) {
      return [];
    }
    return Object.entries(method.schema.properties).map(([k, v]) => createColumn(k, v));
  }

  private getTableName(method: Method): { contextDbName: string; tableName: string } {
    const tableName = `calls_to_${method.method_name}`;
    return { tableName, contextDbName: sanitizeTableName(tableName) };
  }

  private generateSQLForMethod(method: Method): string {
    if (!method.schema.properties) {
      return '';
    }
    const { tableName } = this.getTableName(method);
    const columns = this.getColumns(method);

    // TODO: add NULLABLE for optional fields
    return `
CREATE TABLE ${tableName}
(
  "block_height"    INT,
  "block_timestamp" TIMESTAMP,
  "signer_id"       TEXT,
  "receipt_id"      TEXT,
${columns.map((c) => `  ${c.sql},`).join('\n')}
  PRIMARY KEY ("receipt_id")
);
-- Consider adding an index (https://www.postgresql.org/docs/14/sql-createindex.html) on a frequently queried column, e.g.:
${columns.map((c) => `-- CREATE INDEX "${tableName}_${c.name}_key" ON "${tableName}" ("${c.name}" ASC);`).join('\n')}
    `;
  }

  private generateJSForMethod(method: Method): string {
    const columnNames = this.getColumns(method).map((c) => c.name);
    const primaryKeys = ['receipt_id'];
    const { contextDbName } = this.getTableName(method);
    const methodName = method.method_name;
    return `
  // Extract and upsert ${methodName} function calls
  const callsTo${methodName} = extractFunctionCallEntity("${this.contractFilter}", "${methodName}", ${JSON.stringify(
      columnNames,
    )});
  try {
    await context.db.${contextDbName}.upsert(callsTo${methodName}, ${JSON.stringify(primaryKeys)}, ${JSON.stringify(
      columnNames,
    )});
  } catch(e) {
    context.error(\`Unable to upsert ${methodName} function calls: \$\{e.message\}\`);
  }
`;
  }

  private generateJSCode(): string {
    return `
  function extractFunctionCallEntity(contractFilter, methodName, argsToInclude) {
    const jsonify = (v) => {
      if ((typeof v === "object" && v !== null) || Array.isArray(v))
        return JSON.stringify(v);
      return v;
    };
    return block
      .functionCallsToReceiver(contractFilter, methodName)
      .map((fc) => {
        let fcArgs = {};
        try {
          fcArgs = fc.argsAsJSON();
        } catch (e) {
          console.log(
            \`Failed to parse args \$\{fc.args\} into JSON for \$\{fc.methodName\}\`
          );
        }

        const extractedArgs = Object.fromEntries(
          Object.entries(fcArgs)
            .filter(([k]) => argsToInclude.includes(k))
            .map(([k, v]) => [k, jsonify(v)])
        );
        return {
          block_height: block.blockHeight,
          block_timestamp: block.timestamp,
          signer_id: fc.signerId,
          receipt_id: fc.receiptId,
          ...extractedArgs,
        };
      });
  }
  ${this.selectedMethods.map((m) => this.generateJSForMethod(m)).join('\n')}
`;
  }

  public generateCode(): GeneratedCode {
    const jsCode = this.generateJSCode();
    const sqlCode = this.selectedMethods.map((m) => this.generateSQLForMethod(m)).join('\n');
    return { jsCode, sqlCode };
  }
}
