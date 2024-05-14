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
    "last_elias_gamma_start_bit" NUMERIC(10) NOT NULL,
    "max_index" NUMERIC(10) NOT NULL,
    PRIMARY KEY ("block_date", "receiver_id")
  );
`;

const code = fs.readFileSync('./src/indexer-code', 'utf8');

const indexer = {
  account_id: 'darunrs.near', // Can be anything
  redis_stream: 'test:stream', // Redis stream will need messages for indexer to run. This is just an example.
  function_name: 'bitmap_v4', // Can be anything
  code,
  schema,
};

void (async function main () {
  runnerClient.StopExecutor({
    executorId: 'f1e59f1520c75bab540b74f9d213dd7c99252537345bb8c348e15fdae64312d9'
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
