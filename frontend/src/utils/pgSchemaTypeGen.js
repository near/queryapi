import { Parser } from 'node-sql-parser';

export class PgSchemaTypeGen {
  constructor() {
    this.parser = new Parser();
  }

  getColumnDefinitionNames(columnDefs) {
    const columnDefinitionNames = new Map();
    for (const columnDef of columnDefs) {
      if (columnDef.column?.type === 'column_ref') {
        const columnNameDef = columnDef.column.column.expr;
        const actualColumnName =
          columnNameDef.type === 'double_quote_string' ? `"${columnNameDef.value}"` : columnNameDef.value;
        columnDefinitionNames.set(columnNameDef.value, actualColumnName);
      }
    }
    return columnDefinitionNames;
  }

  retainOriginalQuoting(schema, tableName) {
    const createTableQuotedRegex = `\\b(create|CREATE)\\s+(table|TABLE)\\s+"${tableName}"\\s*`;
    return schema.match(new RegExp(createTableQuotedRegex, 'i')) ? `"${tableName}"` : tableName;
  }

  getTableNameToDefinitionNamesMapping(schema) {
    let schemaSyntaxTree = this.parser.astify(schema, { database: 'Postgresql' });
    schemaSyntaxTree = Array.isArray(schemaSyntaxTree) ? schemaSyntaxTree : [schemaSyntaxTree]; // Ensure iterable
    const tableNameToDefinitionNamesMap = new Map();

    for (const statement of schemaSyntaxTree) {
      if (statement.type === 'create' && statement.keyword === 'table' && statement.table !== undefined) {
        const tableName = statement.table[0].table;

        if (tableNameToDefinitionNamesMap.has(tableName)) {
          throw new Error(
            `Table ${tableName} already exists in schema. Table names must be unique. Quotes are not allowed as a differentiator between table names.`,
          );
        }

        const createDefs = statement.create_definitions ?? [];
        const tableDefinitionNames = {
          originalTableName: this.retainOriginalQuoting(schema, tableName),
          originalColumnNames: this.getColumnDefinitionNames(createDefs),
        };
        tableNameToDefinitionNamesMap.set(tableName, tableDefinitionNames);
      }
    }

    if (tableNameToDefinitionNamesMap.size === 0) {
      throw new Error('Schema does not have any tables. There should be at least one table.');
    }

    return tableNameToDefinitionNamesMap;
  }

  sanitizeTableName(tableName) {
    // Convert to PascalCase
    let pascalCaseTableName = tableName
      .replace(/[^a-zA-Z0-9_]/g, '_') // Replace special characters with underscores
      .replace(/^([a-zA-Z])|_([a-zA-Z])/g, (match) => match.toUpperCase()) // PascalCase transformation
      .replace(/_/g, ''); // Remove all underscores

    // Add underscore if first character is a number
    if (/^[0-9]/.test(pascalCaseTableName)) {
      pascalCaseTableName = '_' + pascalCaseTableName;
    }

    return pascalCaseTableName;
  }

  generateTypes(sqlSchema) {
    const schemaSyntaxTree = this.parser.astify(sqlSchema, { database: 'Postgresql' });
    const dbSchema = {};

    const statements = Array.isArray(schemaSyntaxTree) ? schemaSyntaxTree : [schemaSyntaxTree];
    for (const statement of statements) {
      if (statement.type === 'create' && statement.keyword === 'table') {
        this.processCreateTableStatement(statement, dbSchema);
      } else if (statement.type === 'alter') {
        this.processAlterTableStatement(statement, dbSchema);
      }
    }

    const tsTypes = this.generateTypeScriptDefinitions(dbSchema);
    console.log(`Types successfully generated`);
    return tsTypes;
  }

  processCreateTableStatement(statement, dbSchema) {
    const tableName = statement.table[0].table;

    if (Object.prototype.hasOwnProperty.call(dbSchema, tableName)) {
      throw new Error(
        `Table ${tableName} already exists in schema. Table names must be unique. Quotes are not allowed as a differentiator between table names.`,
      );
    }

    let columns = {};
    for (const columnSpec of statement.create_definitions) {
      if (
        Object.prototype.hasOwnProperty.call(columnSpec, 'column') &&
        Object.prototype.hasOwnProperty.call(columnSpec, 'definition')
      ) {
        this.addColumn(columnSpec, columns);
      } else if (
        columnSpec.constraint_type === 'primary key'
      ) {
        for (const foreignKeyDef of columnSpec.definition) {
          columns[foreignKeyDef.column.expr.value].nullable = false;
        }
      }
    }

    dbSchema[tableName] = columns;
  }

  processAlterTableStatement(statement, dbSchema) {
    const tableName = statement.table[0].table;

    let newConstraint = {};
    for (const alterSpec of statement.expr) {
      switch (alterSpec.action) {
        case 'add':
          switch (alterSpec.resource) {
            case 'column':
              this.addColumn(alterSpec, dbSchema[tableName]);
              break;
            case 'constraint':
              newConstraint = alterSpec.create_definitions;
              if (newConstraint.constraint_type == 'primary key') {
                for (const foreignKeyDef of newConstraint.definition) {
                  dbSchema[tableName][foreignKeyDef.column].nullable = false;
                }
              }
              break;
          }
          break;
        case 'drop':
          delete dbSchema[tableName][alterSpec.column.column];
          break;
      }
    }
  }

  addColumn(columnDef, columns) {
    const columnName = columnDef.column.column.expr.value;
    const columnType = this.getTypescriptType(columnDef.definition.dataType);
    const nullable = this.getNullableStatus(columnDef);
    const required = this.getRequiredStatus(columnDef, nullable);

    if (Object.prototype.hasOwnProperty.call(columns, columnName)) {
      console.warn(`Column ${columnName} already exists in table. Skipping.`);
      return;
    }

    columns[columnName] = {
      type: columnType,
      nullable: nullable,
      required: required,
    };
  }

  getNullableStatus(columnDef) {
    const isPrimaryKey =
      Object.prototype.hasOwnProperty.call(columnDef, 'unique_or_primary') &&
      columnDef.unique_or_primary &&
      columnDef.unique_or_primary === 'primary key';
    const isNullable =
      Object.prototype.hasOwnProperty.call(columnDef, 'nullable') &&
      columnDef.nullable &&
      columnDef.nullable.value === 'not null';
    return isPrimaryKey || isNullable ? false : true;
  }

  getRequiredStatus(columnDef, nullable) {
    const hasDefaultValue =
      Object.prototype.hasOwnProperty.call(columnDef, 'default_val') &&
      columnDef.default_val &&
      columnDef.default_val != null;
    const isSerial = columnDef.definition.dataType.toLowerCase().includes('serial');
    return hasDefaultValue || isSerial || nullable ? false : true;
  }

  generateTypeScriptDefinitions(schema) {
    let tsDefinitions = '';
    let contextObject = `declare const context: {
            graphql: (operation, variables) => Promise<any>,
            set: (key, value) => Promise<any>,
            log: (...log) => Promise<any>,
            fetchFromSocialApi: (path, options) => Promise<Response>,
            db: {`;

    const tableList = new Set();
    for (const [tableName, columns] of Object.entries(schema)) {
      const sanitizedTableName = this.sanitizeTableName(tableName);

      if (tableList.has(sanitizedTableName)) {
        throw new Error(
          `Table '${tableName}' has the same name as another table in the generated types. Special characters are removed to generate context.db methods. Please rename the table.`,
        );
      }

      tableList.add(sanitizedTableName);

      let queryDefinition = `declare interface ${sanitizedTableName}Query {\n`;
      let itemDefinition = `declare interface ${sanitizedTableName}Item {\n`;
      let inputDefinition = `declare interface ${sanitizedTableName}Input {\n`;

      for (const [columnName, columnDetails] of Object.entries(columns)) {
        const tsType = columnDetails.nullable ? columnDetails.type + ' | null' : columnDetails.type;
        const optional = columnDetails.required ? '' : '?';

        queryDefinition += `  ${columnName}?: ${tsType} | ${tsType}[];\n`
        itemDefinition += `  ${columnName}?: ${tsType};\n`;
        inputDefinition += `  ${columnName}${optional}: ${tsType};\n`;
      }

      queryDefinition += '}\n\n';
      itemDefinition += '}\n\n';
      inputDefinition += '}\n\n';
      const columnNamesDef = `type ${sanitizedTableName}Columns = "${Object.keys(columns).join('" | "')}";\n\n`;

      tsDefinitions += queryDefinition + itemDefinition + inputDefinition + columnNamesDef;

      contextObject += `
                ${sanitizedTableName}: {
                    insert: (objectsToInsert: ${sanitizedTableName}Input | ${sanitizedTableName}Input[]) => Promise<${sanitizedTableName}Item[]>;
                    select: (filterObj: ${sanitizedTableName}Query, limit = null) => Promise<${sanitizedTableName}Item[]>;
                    update: (filterObj: ${sanitizedTableName}Query, updateObj: ${sanitizedTableName}Item) => Promise<${sanitizedTableName}Item[]>;
                    upsert: (objectsToInsert: ${sanitizedTableName}Input | ${sanitizedTableName}Input[], conflictColumns: ${sanitizedTableName}Columns[], updateColumns: ${sanitizedTableName}Columns[]) => Promise<${sanitizedTableName}Item[]>;
                    delete: (filterObj: ${sanitizedTableName}Query) => Promise<${sanitizedTableName}Item[]>;
                },`;
    }

    contextObject += '\n  }\n};';
    return tsDefinitions + contextObject;
  }
  getTypescriptType(pgType) {
    const typeMap = {
      // Numeric types
      smallint: 'number',
      integer: 'number',
      bigint: 'number',
      decimal: 'number',
      numeric: 'number',
      real: 'number',
      'double precision': 'number',
      serial: 'number',
      bigserial: 'number',
      // Monetary types
      money: 'number',
      // Character types
      'character varying': 'string',
      varchar: 'string',
      character: 'string',
      char: 'string',
      text: 'string',
      // Binary data types
      bytea: 'Buffer | string',
      // Boolean type
      boolean: 'boolean | string',
      // Date/Time types
      timestamp: 'Date | string',
      'timestamp without time zone': 'Date | string',
      'timestamp with time zone': 'Date | string',
      date: 'Date | string',
      time: 'Date | string',
      'time without time zone': 'Date | string',
      'time with time zone': 'Date | string',
      interval: 'Date | string',
      // UUID type
      uuid: 'string',
      // JSON types
      json: 'string | any',
      jsonb: 'string | any',
      // Arrays
      'integer[]': 'number[]',
      'text[]': 'string[]',
      // Default
      default: 'any', // Replace with appropriate default type
    };
    const typeKey = pgType.toLowerCase();
    return typeMap[typeKey] || typeMap['default'];
  }
}
