import prettier from 'prettier';
import parserBabel from 'prettier/parser-babel';
import SqlPlugin from 'prettier-plugin-sql';

let wrap_code = (code) => `import * as primitives from "@near-lake/primitives"
/** 
 * Note: We only support javascript at the moment. We will support Rust, Typescript in a further release. 
 */


/**
 * getBlock(block, context) applies your custom logic to a Block on Near and commits the data to a database. 
 * context is a global variable that contains helper methods. 
 * context.db is a subfield which contains helper methods to interact with your database.
 * 
 * Learn more about indexers here:  https://docs.near.org/concepts/advanced/indexers
 * 
 * @param {block} Block - A Near Protocol Block
 */
async function getBlock(block: primitives.Block) {
  ${code}
}`;

export const formatSQL = (schema) => {
  return prettier.format(schema, {
    parser: 'sql',
    formatter: 'sql-formatter',
    plugins: [SqlPlugin],
    pluginSearchDirs: false,
    language: 'postgresql',
    database: 'postgresql',
  });
};

export const wrapCode = (code) => {
  code = code.replace(/(?:\\[n])+/g, '\r\n');
  const wrappedCode = wrap_code(code);
  return wrappedCode;
};

export const formatIndexingCode = (code) => {
  return prettier.format(code, {
    parser: 'babel',
    plugins: [parserBabel],
  });
};

export const defaultCode = formatIndexingCode(
  wrapCode(
    `
  // Add your code here   
  const h = block.header().height
  await context.set('height', h);
`,
  ),
);

export const defaultSchema = `
CREATE TABLE "indexer_storage" ("function_name" TEXT NOT NULL, "key_name" TEXT NOT NULL, "value" TEXT NOT NULL, PRIMARY KEY ("function_name", "key_name"))
`;

export const defaultSchemaTypes = `declare interface IndexerStorageItem {
  function_name?: string;
  key_name?: string;
  value?: string;
}

declare interface IndexerStorageInput {
  function_name: string;
  key_name: string;
  value: string;
}

declare const context: {

			graphql: (operation, variables) => Promise<any>,
			set: (key, value) => Promise<any>,
			log: (...log) => Promise<any>,
			fetchFromSocialApi: (path, options) => Promise<Response>,
			db: {
			IndexerStorage: {
				insert: (objects: IndexerStorageInput | IndexerStorageInput[]) => Promise<IndexerStorageItem[]>;
				select: (object: IndexerStorageItem, limit = null) => Promise<IndexerStorageItem[]>;
				update: (whereObj: IndexerStorageItem, updateObj: IndexerStorageItem) => Promise<IndexerStorageItem[]>;
				upsert: (objects: IndexerStorageInput | IndexerStorageInput[], conflictColumns: IndexerStorageItem, updateColumns: IndexerStorageItem) => Promise<IndexerStorageItem[]>;
				delete: (object: IndexerStorageInput) => Promise<IndexerStorageItem[]>;
			},
  }
};
`;
