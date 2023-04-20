import { formatSQL, formatIndexingCode } from "./formatters";

const inputSQL1 = `CREATE TABLE\n  \"indexer_storage\" (\n    \"function_name\" TEXT NOT NULL,\n    \"key_name\" TEXT NOT NULL,\n    \"value\" TEXT NOT NULL,\n    PRIMARY KEY (\"function_name\", \"key_name\")\n  )\n`;
const expectedOutput1 =
  `CREATE TABLE
  "indexer_storage" (
    "function_name" TEXT NOT NULL,
    "key_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    PRIMARY KEY ("function_name", "key_name")
  )
`;

test("Basic formatting for SQL", () => {
  expect(formatSQL(inputSQL1)).toEqual(expectedOutput1);
});

const inputSQL2 = `CREATE INVALID TABLE indexer_storage"`;

test("Formatting invalid SQL input returns the invalid unformatted input", () => {
  console.log(formatSQL(inputSQL2));
  expect(formatSQL(inputSQL2)).toEqual(inputSQL2);
})

const inputJS2 = "\n  const h = block.header().height;\n  console.log(\"About to write demo_blockheight\", h);\n  await context.set(\"demo_height\", h);\n";
const expectedOutput2 = `const h = block.header().height;
console.log("About to write demo_blockheight", h);
await context.set("demo_height", h);\n`;

test("formatting for JS code without wrapCode", () => {
  expect(formatIndexingCode(inputJS2, false)).toEqual(expectedOutput2);
});


const expectedOutput3 = `import { Block } from "@near-lake/primitives";
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
  const h = block.header().height;
  console.log("About to write demo_blockheight", h);
  await context.set("demo_height", h);
}
`;

test("formatting for JS code with wrapCode", () => {
  expect(formatIndexingCode(inputJS2, true)).toEqual(expectedOutput3);
});

const inputJS3 = "const a = block.header().height;\nawait context.set(\"demo_height\", h\n";

test("Handling invalid JS input returns original", () => {
  expect(formatIndexingCode(inputJS3, false)).toEqual(inputJS3);
});
