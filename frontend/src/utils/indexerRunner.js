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

  get isExecuting() {
    return !this.shouldStop;
  }

  async start(startingHeight, indexingCode, option) {
    this.currentHeight = startingHeight;
    this.shouldStop = false;
    console.clear()
    console.group('%c Welcome! Lets test your indexing logic on some Near Blocks!', 'color: white; background-color: navy; padding: 5px;');
    if (!Number(startingHeight)) {
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
        await this.executeIndexerFunction(this.currentHeight, blockDetails, indexingCode);
        this.currentHeight++;
        await this.delay(1000);
      }
      console.groupEnd()

    }
  }

  // Call this method to signal the block processing loop to stop
  stop() {
    this.shouldStop = true;
    console.log("%c Stopping Block Processing", 'color: white; background-color: red; padding: 5px;')
  }

  delay(ms) {
    // this.stop()
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async executeIndexerFunction(height, blockDetails, indexingCode) {
    let innerCode = indexingCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1];
    if (blockDetails) {
      const block = Block.fromStreamerMessage(blockDetails);
      block.actions()
      block.receipts()
      block.events()

      // console.group("Block Details")
      console.log(block)
      // console.groupEnd()
      await this.runFunction(blockDetails, height, innerCode);
    }
  }

  async executeIndexerFunctionOnHeights(heights, indexingCode) {
    console.clear()
    console.group('%c Welcome! Lets test your indexing logic on some Near Blocks!', 'color: white; background-color: navy; padding: 5px;');
    if (heights.length === 0) {
      console.warn("No Block Heights Selected")
      return
    }
    console.log("Note: GraphQL Mutations & Queries will not be executed on your database. They will simply return an empty object. Please keep this in mind as this may cause unintended behavior of your indexer function.")
    // for loop with await
    for await (const height of heights) {
      console.group(`Block Height #${height}`)
      let blockDetails;
      try {
        blockDetails = await fetchBlockDetails(height);
      } catch (error) {
        console.log(error)
      }
      console.time('Indexing Execution Complete')
      this.executeIndexerFunction(height, blockDetails, indexingCode)
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
