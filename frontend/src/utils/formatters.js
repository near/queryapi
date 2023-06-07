import prettier from "prettier";
import SqlPlugin from "prettier-plugin-sql";
import parserBabel from "prettier/parser-babel";

let wrap_code = (code) => `import {Block} from "@near-lake/primitives"
/** 
 * Note: We only support javascript at the moment. We will support Rust, Typescript in a further release. 
 */


/**
 * getBlock(block, context) applies your custom logic to a Block on Near and commits the data to a database. 
 * 
 * Learn more about indexers here:  https://docs.near.org/concepts/advanced/indexers
 * 
 * @param {block} Block - A Near Protocol Block 
 * @param {context} - A set of helper methods to retrieve and commit state
 */
async function getBlock(block: Block, context) {
  ${code}
}`;

export const formatSQL = (schema) => {
  try {
    return prettier.format(schema, {
      parser: "sql",
      formatter: "sql-formatter",
      plugins: [SqlPlugin],
      pluginSearchDirs: false,
      language: "postgresql",
      database: "postgresql",
    });
  } catch (e) {
    console.log(e);
    return schema;
  }
};

export const wrapCode = (code) => {
  code = code.replace(/(?:\\[n])+/g, "\r\n");
  const wrappedCode = wrap_code(code);
  return wrappedCode
}

export const formatIndexingCode = (code) => {
  try {
    return prettier.format(code, {
      parser: "babel",
      plugins: [parserBabel],
    });
  } catch (e) {
    return code;
  }
};

export const defaultCode = formatIndexingCode(
  `
  // Add your code here   
  const h = block.header().height
  await context.set('height', h);
`,
  true
);

export const defaultSchema = `
CREATE TABLE "indexer_storage" ("function_name" TEXT NOT NULL, "key_name" TEXT NOT NULL, "value" TEXT NOT NULL, PRIMARY KEY ("function_name", "key_name"))
`;
