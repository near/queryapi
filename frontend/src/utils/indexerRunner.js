import { Block } from "@near-lake/primitives";
import { Buffer } from "buffer";
import { fetchBlockDetails } from "./fetchBlock";

global.Buffer = Buffer;
export default class IndexerRunner {
  constructor(handleLog) {
    this.handleLog = handleLog;
    this.currentHeight = 0;
    this.shouldStop = false;
  }

  async start(startingHeight, indexingCode, schema, schemaName, option) {
    this.currentHeight = startingHeight;
    this.shouldStop = false;
    console.clear()
    console.group('%c Welcome! Lets test your indexing logic on some Near Blocks!', 'color: white; background-color: navy; padding: 5px;');
    if (option == "specific" && !Number(startingHeight)) {
      console.log("No Start Block Height Provided to Stream Blocks From")
      this.stop()
      console.groupEnd()
      return
    }
    console.log(`Streaming Blocks Starting from ${option} Block #${this.currentHeight}`)
    while (!this.shouldStop) {
      console.group(`Block Height #${this.currentHeight}`)
      let blockDetails;
      try {
        blockDetails = await fetchBlockDetails(this.currentHeight);
      } catch (error) {
        console.log(error)
        this.stop()
      }
      if (blockDetails) {
        await this.executeIndexerFunction(this.currentHeight, blockDetails, indexingCode, schema, schemaName);
        this.currentHeight++;
        await this.delay(1000);
      }
      console.groupEnd()

    }
  }

  stop() {
    this.shouldStop = true;
    console.log("%c Stopping Block Processing", 'color: white; background-color: red; padding: 5px;')
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  validateTableNames(tableNames) {
    if (!(Array.isArray(tableNames) && tableNames.length > 0)) {
      throw new Error("Schema does not have any tables. There should be at least one table.");
    }
    const correctTableNameFormat = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

    tableNames.forEach(name => {
      if (!name.includes("\"") && !correctTableNameFormat.test(name)) { // Only test if table name doesn't have quotes
        throw new Error(`Table name ${name} is not formatted correctly. Table names must not start with a number and only contain alphanumerics or underscores.`);
      }
    });
  }

  async executeIndexerFunction(height, blockDetails, indexingCode, schema, schemaName) {
    let innerCode = indexingCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1];
    const tableRegex = /CREATE TABLE(?: IF NOT EXISTS)?\s+(.+?)\s*\(/g;
    const tableNames = Array.from(schema.matchAll(tableRegex), match => {
      if (match[1].includes(".")) { // If expression after create has schemaName.tableName, return only tableName
        return match[1].split(".")[1];
      } else if (match[1].match(/^(?!["'])(.*\W.*)$/)) { // If table name IS NOT a single word and DOES NOT have quotes, add quotes
        return `"${match[1]}"`;
      } else if (match[1].match(/^["'](\w+)["']$/)) { // If table name IS a single word and HAS quotes, remove the quotes
        return match[1].match(/^["'](\w+)["']$/)[1];
      }
      return match[1];
    });
    console.log(tableNames);
    this.validateTableNames(tableNames);

    if (blockDetails) {
      const block = Block.fromStreamerMessage(blockDetails);
      block.actions()
      block.receipts()
      block.events()

      console.log(block)
      await this.runFunction(blockDetails, height, innerCode, schemaName, tableNames);
    }
  }

  async executeIndexerFunctionOnHeights(heights, indexingCode, schema, schemaName) {
    console.clear()
    console.group('%c Welcome! Lets test your indexing logic on some Near Blocks!', 'color: white; background-color: navy; padding: 5px;');
    if (heights.length === 0) {
      console.warn("No Block Heights Selected")
      return
    }
    console.log("Note: GraphQL Mutations & Queries will not be executed on your database. They will simply return an empty object. Please keep this in mind as this may cause unintended behavior of your indexer function.")
    for await (const height of heights) {
      console.group(`Block Height #${height}`)
      let blockDetails;
      try {
        blockDetails = await fetchBlockDetails(height);
      } catch (error) {
        console.log(error)
      }
      console.time('Indexing Execution Complete')
      this.executeIndexerFunction(height, blockDetails, indexingCode, schema, schemaName)
      console.timeEnd('Indexing Execution Complete')
      console.groupEnd()
    }
    console.groupEnd()
  }

  async runFunction(streamerMessage, blockHeight, indexerCode, schemaName, tableNames) {
    const innerCodeWithBlockHelper =
      `
      const block = Block.fromStreamerMessage(streamerMessage);
    ` + indexerCode;

    const modifiedFunction = this.transformIndexerFunction(
      innerCodeWithBlockHelper
    );

    // Create a function wrapper around the evaluated code
    const wrappedFunction = new Function(
      "Block",
      "streamerMessage",
      "context",
      modifiedFunction
    );

    // Define the custom context object
    const context = {
      set: async (key, value) => {
        this.handleLog(
          blockHeight,
          "",
          () => {
            console.group(`Setting Key/Value`);
            console.log({[key]: value});
            console.groupEnd();
          }
        );
        return {};
      },
      graphql: async (query, mutationData) => {
        this.handleLog(
          blockHeight,
          "",
          () => {
            let operationType, operationName
            const match = query.match(/(query|mutation)\s+(\w+)\s*(\(.*?\))?\s*\{([\s\S]*)\}/);
            if (match) {
              operationType = match[1];
              operationName = match[2];
            }
            console.group(`Executing GraphQL ${operationType}: (${operationName})`);
            if (operationType === 'mutation') console.log('%c Mutations in debug mode do not alter the database', 'color: black; background-color: yellow; padding: 5px;');
            console.group(`Data passed to ${operationType}`);
            console.dir(mutationData); 
            console.groupEnd();
            console.group(`Data returned by ${operationType}`);
            console.log({})
            console.groupEnd();
            console.groupEnd();
          }
        );
        return {};
      },
      log: async (message) => {
        this.handleLog(blockHeight, message);
      },
      db: this.buildDatabaseContext(blockHeight, schemaName, tableNames)
    };

    wrappedFunction(Block, streamerMessage, context);
  }

  buildDatabaseContext (blockHeight, schemaName, tables) {
    try {
      const result = tables.reduce((prev, tableName) => ({
        ...prev,
        [`insert_${tableName}`]: async (objects) => await this.insert(blockHeight, schemaName, tableName, objects),
        [`select_${tableName}`]: async (object, limit = 0) => await this.select(blockHeight, schemaName, tableName, object, limit),
      }), {});
      console.log(result);
      return result;
    } catch (error) {
      console.error('Caught error when generating DB methods. Falling back to generic methods.', error);
      return {
        insert: async (tableName, objects) => {
          this.insert(blockHeight, schemaName, tableName, objects);
        },
        select: async (tableName, object, limit = 0) => {
          this.select(blockHeight, schemaName, tableName, object, limit);
        }
      };
    }
  }

  insert(blockHeight, schemaName, tableName, objects) {
    this.handleLog(
      blockHeight,
      "",
      () => {
        console.log('Inserting object %s into table %s on schema %s', JSON.stringify(objects), tableName, schemaName);
      }
    );
    return {};
  }

  select(blockHeight, schemaName, tableName, object, limit) {
    this.handleLog(
      blockHeight,
      "",
      () => {
        const roundedLimit = Math.round(limit);
        console.log('Selecting objects with values %s from table %s on schema %s with %s limit', JSON.stringify(object), tableName, schemaName, limit === 0 ? 'no' : roundedLimit.toString());
      }
    );
    return {};
  }

  // deprecated
  replaceNewLines(code) {
    return code.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }

  enableAwaitTransform(indexerFunction) {
    return `
            async function f(){
                ${indexerFunction}
            };
            f();
        `;
  }

  transformIndexerFunction(indexerFunction) {
    return [this.replaceNewLines, this.enableAwaitTransform].reduce(
      (acc, val) => val(acc),
      indexerFunction
    );
  }

  renameUnderscoreFieldsToCamelCase(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // It's a non-null, non-array object, create a replacement with the keys initially-capped
      const newValue = {};
      for (const key in value) {
        const newKey = key
          .split("_")
          .map((word, i) => {
            if (i > 0) {
              return word.charAt(0).toUpperCase() + word.slice(1);
            }
            return word;
          })
          .join("");
        newValue[newKey] = value[key];
      }
      return newValue;
    }
    return value;
  }
}
