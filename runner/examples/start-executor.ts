// Run with 'npx ts-node src/test-client.ts'

import runnerClient from '../src/server/runner-client';
import fs from 'fs';

const schema = `
CREATE TABLE
  "actions_index" (
    "block_date" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "first_block_height" NUMERIC(20) NOT NULL,
    "bitmap" TEXT NOT NULL,
    PRIMARY KEY ("block_date", "receiver_id")
  );
`;

const code = fs.readFileSync('./src/indexer-code', 'utf8');

const indexer = {
  account_id: 'nearpavel.near', // Can be anything
  redis_stream: 'test:stream', // Redis stream will need messages for indexer to run. This is just an example.
  function_name: 'bitmap_v2', // Can be anything
  code,
  schema,
};

void (async function main () {
  runnerClient.StopExecutor({
    executorId: 'f778fc14ebf01fb35b827810c7e46a8d077ac702861645dd9befd8bed8ecb1ef'
  }, (err, response) => {
    if (err) {
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
    } else {
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
    }
  });
  // runnerClient.StartExecutor({
  //   redisStream: indexer.redis_stream,
  //   accountId: indexer.account_id,
  //   functionName: indexer.function_name,
  //   code: indexer.code,
  //   schema: indexer.schema
  // }, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('start request: ', response);
  //   }
  // });
})();
