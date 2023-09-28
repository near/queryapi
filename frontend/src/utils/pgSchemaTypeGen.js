import { Parser } from "node-sql-parser";

export class PgSchemaTypeGen {
	constructor() {
		this.parser = new Parser();
		this.tables = new Set();
	}

	sanitizeTableName(tableName) {
		// Convert to PascalCase
		let pascalCaseTableName = tableName
			// Replace special characters with underscores
			.replace(/[^a-zA-Z0-9_]/g, '_')
			// Makes first letter and any letters following an underscore upper case
			.replace(/^([a-zA-Z])|_([a-zA-Z])/g, (match) => match.toUpperCase())
			// Removes all underscores
			.replace(/_/g, '');
  
	  // Add underscore if first character is a number
	  if (/^[0-9]/.test(pascalCaseTableName)) {
		  pascalCaseTableName = '_' + pascalCaseTableName;
	  }
  
	  return pascalCaseTableName;
	}

	getTableNames (schema) {
		let schemaSyntaxTree = this.parser.astify(schema, { database: 'Postgresql' });
		schemaSyntaxTree = Array.isArray(schemaSyntaxTree) ? schemaSyntaxTree : [schemaSyntaxTree]; // Ensure iterable
		const tableNames = new Set();

		// Collect all table names from schema AST, throw error if duplicate table names exist
		for (const statement of schemaSyntaxTree) {
      if (statement.type === 'create' && statement.keyword === 'table' && statement.table !== undefined) {
        const tableName = statement.table[0].table;

        if (tableNames.has(tableName)) {
          throw new Error(`Table ${tableName} already exists in schema. Table names must be unique. Quotes are not allowed as a differentiator between table names.`);
        }

        tableNames.add(tableName);
      }
    }

    // Ensure schema is not empty
    if (tableNames.size === 0) {
      throw new Error('Schema does not have any tables. There should be at least one table.');
    }

    const tableNamesArray = Array.from(tableNames);
    return Array.from(tableNamesArray);
  }

	generateTypes(sqlSchema) {
		const schemaSyntaxTree = this.parser.astify(sqlSchema, { database: "Postgresql" });
		const dbSchema = {};

		// Process each statement in the schema
		for (const statement of schemaSyntaxTree) {
			if (statement.type === "create" && statement.keyword === "table") {
				// Process CREATE TABLE statements
				const tableName = statement.table[0].table;
				if (dbSchema.hasOwnProperty(tableName)) {
					throw new Error(`Table ${tableName} already exists in schema. Table names must be unique. Quotes are not allowed as a differentiator between table names.`);
				}

				let columns = {};
				for (const columnSpec of statement.create_definitions) {
					if (columnSpec.hasOwnProperty("column") && columnSpec.hasOwnProperty("definition")) {
						// New Column
						this.addColumn(columnSpec, columns);
					} else if (columnSpec.hasOwnProperty("constraint") && columnSpec.constraint_type == "primary key") {
						// Constraint on existing column
						for (const foreignKeyDef of columnSpec.definition) {
							columns[foreignKeyDef.column].nullable = false;
						}
					}
				}
				dbSchema[tableName] = columns;
			} else if (statement.type === "alter") {
				// Process ALTER TABLE statements
				const tableName = statement.table[0].table;
				for (const alterSpec of statement.expr) {
					switch (alterSpec.action) {
						case "add":
							switch (alterSpec.resource) {
								case "column": // Add column to table
									this.addColumn(alterSpec, dbSchema[tableName]);
									break;
								case "constraint": // Add constraint to column(s) (Only PRIMARY KEY constraint impacts output types)
									const newConstraint = alterSpec.create_definitions;
									if (newConstraint.constraint_type == "primary key") {
										for (const foreignKeyDef of newConstraint.definition) {
											dbSchema[tableName][foreignKeyDef.column].nullable = false;
										}
									}
									break;
							}
							break;
						case "drop": // Can only drop column for now
							delete dbSchema[tableName][alterSpec.column.column];
							break;
					}
				}
			}
		}

		const tsTypes = this.generateTypeScriptDefinitions(dbSchema);
    console.log(`Types successfully generated`);
		return tsTypes;
	}
	
  addColumn(columnDef, columns) {
		const columnName = columnDef.column.column;
		const columnType = this.getTypescriptType(columnDef.definition.dataType);
		const nullable = this.getNullableStatus(columnDef);
		const required = this.getRequiredStatus(columnDef, nullable);
		if (columns.hasOwnProperty(columnName)) {
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
			columnDef.hasOwnProperty("unique_or_primary") &&
			columnDef.unique_or_primary == "primary key";
		const isNullable =
			columnDef.hasOwnProperty("nullable") &&
			columnDef.nullable.value == "not null";
		return isPrimaryKey || isNullable ? false : true;
	}
	
	getRequiredStatus(columnDef, nullable) {
		const hasDefaultValue =
			columnDef.hasOwnProperty("default_val") && columnDef.default_val != null;
		const isSerial = columnDef.definition.dataType
			.toLowerCase()
			.includes("serial");
		return hasDefaultValue || isSerial || nullable ? false : true;
	}
	
	generateTypeScriptDefinitions(schema) {
		const tableList = new Set();
		let tsDefinitions = "";
		let contextObject = `declare const context: {
	graphql: (operation, variables) => Promise<any>,
	set: (key, value) => Promise<any>,
	log: (...log) => Promise<any>,
	fetchFromSocialApi: (path, options) => Promise<Response>,
	db: {`;
	
		// Process each table
		for (const [tableName, columns] of Object.entries(schema)) {
			let itemDefinition = "";
			let inputDefinition = "";
			const sanitizedTableName = this.sanitizeTableName(tableName);
      if (tableList.has(sanitizedTableName)) {
        throw new Error(`Table '${tableName}' has the same name as another table in the generated types. Special characters are removed to generate context.db methods. Please rename the table.`);
      }
			tableList.add(sanitizedTableName);
			// Create interfaces for strongly typed input and row item
			itemDefinition += `declare interface ${sanitizedTableName}Item {\n`;
			inputDefinition += `declare interface ${sanitizedTableName}Input {\n`;
			for (const [columnName, columnDetails] of Object.entries(columns)) {
				let tsType = columnDetails.nullable ? columnDetails.type + " | null" : columnDetails.type;
				const optional = columnDetails.required ? "" : "?";
				itemDefinition += `  ${columnName}?: ${tsType};\n`; // Item fields are always optional
				inputDefinition += `  ${columnName}${optional}: ${tsType};\n`;
			}
			itemDefinition += "}\n\n";
			inputDefinition += "}\n\n";

      // Create type containing column names to be used as a replacement for string[]. 
      const columnNamesDef = `type ${sanitizedTableName}Columns = "${Object.keys(columns).join('" | "')}";\n\n`;

      // Add generated types to definitions
			tsDefinitions += itemDefinition + inputDefinition + columnNamesDef;

			// Create context object with correctly formatted methods. Name, input, and output should match actual implementation
			contextObject += `
		${sanitizedTableName}: {
			insert: (objectsToInsert: ${sanitizedTableName}Input | ${sanitizedTableName}Input[]) => Promise<${sanitizedTableName}Item[]>;
			select: (filterObj: ${sanitizedTableName}Item, limit = null) => Promise<${sanitizedTableName}Item[]>;
			update: (filterObj: ${sanitizedTableName}Item, updateObj: ${sanitizedTableName}Item) => Promise<${sanitizedTableName}Item[]>;
			upsert: (objectsToInsert: ${sanitizedTableName}Input | ${sanitizedTableName}Input[], conflictColumns: ${sanitizedTableName}Columns[], updateColumns: ${sanitizedTableName}Columns[]) => Promise<${sanitizedTableName}Item[]>;
			delete: (filterObj: ${sanitizedTableName}Item) => Promise<${sanitizedTableName}Item[]>;
		},`;
		}
	
		contextObject += '\n  }\n};'
		this.tableList = tableList;
	
		return tsDefinitions + contextObject;
	}
	
	getTypescriptType(pgType) {
		switch (pgType.toLowerCase()) {
			// Numeric types
			case "smallint":
			case "integer":
			case "bigint":
			case "decimal":
			case "numeric":
			case "real":
			case "double precision":
			case "serial":
			case "bigserial":
				return "number";
	
			// Monetary types
			case "money":
				return "number";
	
			// Character types
			case "character varying":
			case "varchar":
			case "character":
			case "char":
			case "text":
				return "string";
	
			// Binary data types
			case "bytea":
				return "Buffer";
	
			// Boolean type
			case "boolean":
				return "boolean";
	
			// Date/Time types
			case "timestamp":
			case "timestamp without time zone":
			case "timestamp with time zone":
			case "date":
			case "time":
			case "time without time zone":
			case "time with time zone":
			case "interval":
				return "Date";
	
			// UUID type
			case "uuid":
				return "string";
	
			// JSON types
			case "json":
			case "jsonb":
				return "any";
	
			// Arrays
			case "integer[]":
				return "number[]";
	
			case "text[]":
				return "string[]";
	
			// Others
			default:
				return "any";
		}
	}
}