// Run with 'npx ts-node create_executor.ts'

import runnerClient from '../src/server/runner-client';

const schema = `
CREATE TABLE
  "indexer_storage" (
    "function_name" TEXT NOT NULL,
    "key_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    PRIMARY KEY ("function_name", "key_name")
  )
`;

const code = `
console.log("hello");
`;

const indexer = {
  account_id: 'account.near', // Can be anything
  redis_stream: 'test:stream', // Redis stream will need messages for indexer to run. This is just an example.
  function_name: 'sample_indexer', // Can be anything
  code,
  schema,
};

void (async function main () {
  runnerClient.StartExecutor({
    redisStream: indexer.redis_stream,
    accountId: indexer.account_id,
    functionName: indexer.function_name,
    code: indexer.code,
    schema: indexer.schema
  }, (err, response) => {
    if (err) {
      console.error('error: ', err);
    } else {
      console.log('start request: ', response);
    }
  });
})();
