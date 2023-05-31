import { Block } from "@near-lake/primitives";
import { Buffer } from "buffer";
import {fetchBlockDetails} from "./fetchBlock";

global.Buffer = Buffer;
export default class IndexerRunner {
  constructor(handleLog) {
    this.handleLog = handleLog;
  }

  async executeIndexerFunction(heights, indexingCode) {
    console.clear()
    console.group('%c Welcome! Lets test your indexing logic on some Near Blocks!', 'color: white; background-color: navy; padding: 5px;');
    if(heights.length === 0) {
      console.warn("No Block Heights Selected")
    }
    console.log("Note: GraphQL Mutations & Queries will not be executed on your database. They will simply return an empty object. Please keep this in mind as this may cause unintended behavior of your indexer function.")
    let innerCode = indexingCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1];
    // for loop with await
    for await (const height of heights) {
      console.group(`Block Height #${height}`)
      const block_details = await fetchBlockDetails(height);
      console.time('Indexing Execution Complete')
      if (block_details) {
        await this.runFunction(block_details, height, innerCode);
      }
      console.timeEnd('Indexing Execution Complete')
      console.groupEnd()
    }
    console.groupEnd()
  }

  async runFunction(streamerMessage, blockHeight, indexerCode) {
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
            console.log({key: value});
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
    };

    // Call the wrapped function, passing the imported Block and streamerMessage
    wrappedFunction(Block, streamerMessage, context);
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

  // async runGraphQLQuery(
  //   operation,
  //   variables,
  //   function_name,
  //   block_height,
  //   hasuraRoleName,
  //   logError = true
  // ) {
  //   const response = await this.deps.fetch(
  //     `${process.env.HASURA_ENDPOINT}/v1/graphql`,
  //     {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/json",
  //         ...(hasuraRoleName && { "X-Hasura-Role": hasuraRoleName }),
  //       },
  //       body: JSON.stringify({
  //         query: operation,
  //         ...(variables && { variables }),
  //       }),
  //     }
  //   );
  //
  //   const { data, errors } = await response.json();
  //
  //   if (response.status !== 200 || errors) {
  //     if (logError) {
  //     }
  //     throw new Error(
  //       `Failed to write graphql, http status: ${
  //         response.status
  //       }, errors: ${JSON.stringify(errors, null, 2)}`
  //     );
  //   }
  //
  //   return data;
  // }
  //

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
