import prettier from 'prettier';
import SqlPlugin from 'prettier-plugin-sql'

import parserBabel from 'prettier/parser-babel';
let unformatted_code = (code) => `import {Block} from "@near-lake/primitives"
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
}`


export const formatSQL = (schema) => {
    try {
        return prettier.format(schema, {
            parser: "sql",
            formatter: "sql-formatter",
            plugins: [SqlPlugin],
            pluginSearchDirs: false,
            language: 'postgresql',
            database: 'postgresql',
        });
    } catch (e) {
        console.log(e);
        return schema;
    }
};

export const formatIndexingCode = (code, wrapCode) => {
    code = code.replace(/(?:\\[n])+/g, "\r\n")
    if (wrapCode) {
        code = unformatted_code(code)
    }
    try {
        return prettier.format(code, {
            parser: "babel",
            plugins: [parserBabel],
        });
    }
    catch (e) {
        console.log(e);
        return code;
    }
};
