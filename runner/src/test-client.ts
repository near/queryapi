// Run with 'npx ts-node src/test-client.ts'

import runnerClient from './server/runner-client';

const schema = `

CREATE TABLE
versions (
  "id" SERIAL PRIMARY KEY,
  "block_height" BIGINT NOT NULL,
  "block_timestamp_ms" BIGINT NOT NULL,
  "code" VARCHAR NOT NULL,
  "component_author_id" VARCHAR NOT NULL,
  "component_name" VARCHAR NOT NULL,
  "lines_added" INT NOT NULL,
  "lines_removed" INT NOT NULL,
  "receipt_id" VARCHAR NOT NULL
);

CREATE TABLE 
metadata (
  "component_id" VARCHAR PRIMARY KEY,
  "block_height" BIGINT NOT NULL,
  "block_timestamp_ms" BIGINT NOT NULL,
  "code" VARCHAR NOT NULL,
  "component_author_id" VARCHAR NOT NULL,
  "component_name" VARCHAR NOT NULL,
  "star_count" INT NOT NULL,
  "fork_count" INT NOT NULL,
  "name" VARCHAR, 
  "image_ipfs_cid" VARCHAR,
  "description" VARCHAR,
  "fork_of_source" VARCHAR,
  "fork_of_block_height" BIGINT,
  "tags" VARCHAR,
  "website" VARCHAR
);
`;

const code = `
const h = block.header().height;
const blockTimestampMs = Math.floor(
  Number(block.header().timestampNanosec) / 1e6
);
const code = 'console.log("hello world")';
const componentAuthorId = 'kevin0.near';
const componentName = 'test_component_1';
const linesAdded = 1;
const linesRemoved = 1;
receiptId = '3WGZ91JVF2kxF54SryuktCCmH2kgijuGM9P3uoqSGs5s'

await console.debug('debug log');
await console.log('info log');
await console.error('error log');

// await context.db.Metadata.insert(
//   {block_height: h, block_timestamp_ms: blockTimestampMs, code, component_author_id: componentAuthorId, component_name: componentName, star_count: 0, fork_count: 0, name: 'test', image_ipfs_cid: 'test', description: 'test', fork_of_source: 'test', fork_of_block_height: 0, tags: 'test', website: 'test'}
//   );
`;

const indexer = {
  account_id: 'kevin0.near',
  redis_stream: 'test:block_stream',
  function_name: 'component_01',
  code,
  start_block_height: 113448278,
  schema,
  provisioned: true,
  indexer_rule: {
    indexer_rule_kind: 'Action',
    matching_rule: {
      rule: 'ACTION_ANY',
      affected_account_id: 'social.near',
      status: 'SUCCESS'
    },
    id: null,
    name: null
  }
};

void (async function main () {
  // console.log(indexer.redis_stream, indexer.account_id, indexer.function_name, indexer.code, indexer.schema)
  runnerClient.StartExecutor({
    redisStream: indexer.redis_stream,
    accountId: indexer.account_id,
    functionName: indexer.function_name,
    code: indexer.code,
    schema: indexer.schema
  }, (err, response) => {
    if (err) {
      console.error('dsoihfiouadshfiodashfdshifs: ', err);
    } else {
      console.log('start: ', response);
      console.log('running...')
    }
  });
  console.log('done')
})();