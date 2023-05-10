import { Block } from "@near-lake/primitives";

export default class Indexer {
  constructor(handleLog) {
    this.handleLog = handleLog;
  }
  async runFunction(streamerMessage, indexerCode) {
    const innerCodeWithBlockHelper =
      `
      const block = Block.fromStreamerMessage(streamerMessage);
      console.log(block,"blocks");
    ` + indexerCode;

    const modifiedFunction = this.transformIndexerFunction(
      innerCodeWithBlockHelper
    );

    console.log(modifiedFunction, "modifiedFunction");

    // Create a function wrapper around the evaluated code
    const wrappedFunction = new Function(
      "Block",
      "streamerMessage",
      "context",
      modifiedFunction
    );

    // Define the custom context object
    const context = {
      set: async () => {
        this.handleLog("Context.set() is not supported in debug mode.");
        return {};
      },
      graphql: async () => {
        this.handleLog("Context.graphql() is not supported in debug mode.");
        return {};
      },
      log: async (message) => {
        this.handleLog(message);
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

  async writeLog(function_name, block_height, ...message) {
    this.handleLog(message);
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
