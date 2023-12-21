// TODO: Replace this client with Rust client
// Run with 'npx ts-node src/test-client.ts'

import runnerClient from './server/runner-client';

const indexer = {
  account_id: 'darunrs.near',
  redis_stream: 'darunrs.near/test_sweat_blockheight:real_time:stream',
  function_name: 'test_sweat_blockheight',
  code: '\n  const h = block.header().height;\n await context.set(\'height\', h);\n',
  start_block_height: 106881495,
  schema: 'CREATE TABLE\n' +
    '  "indexer_storage" (\n' +
    '    "function_name" TEXT NOT NULL,\n' +
    '    "key_name" TEXT NOT NULL,\n' +
    '    "value" TEXT NOT NULL,\n' +
    '    PRIMARY KEY ("function_name", "key_name")\n' +
    '  )\n',
  provisioned: true,
  indexer_rule: {
    indexer_rule_kind: 'Action',
    matching_rule: {
      rule: 'ACTION_ANY',
      affected_account_id: 'token.sweat',
      status: 'SUCCESS'
    },
    id: null,
    name: null
  }
};

const updateCode = '\n  const h = block.header().height;';

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

void (async function main () {
  let count = 0;
  while (count < 10) {
    if (count === 1) {
      runnerClient.StartExecutor({
        executorId: 'darunrs sweat blockheight',
        redisStream: 'darunrs.near/test_sweat_blockheight:real_time:stream',
        accountId: indexer.account_id,
        functionName: indexer.function_name,
        schema: indexer.schema
      }, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('start: ', response);
        }
      });
    }
    if (count === 2) {
      runnerClient.ListExecutors({}, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('list: ', response);
        }
      });
      break;
    }
    if (count === 4) {
      runnerClient.StopExecutor({
        executorId: 'darunrs sweat blockheight',
      }, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('stop: ', response);
        }
      });
    }
    if (count === 5) {
      indexer.code = updateCode; // Change Indexer code to not run mutations, which will change logging output
      runnerClient.ListExecutors({}, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('list: ', response);
        }
      });
    }
    if (count === 6) {
      indexer.code = updateCode;
      runnerClient.StartExecutor({
        executorId: 'darunrs sweat blockheight',
        redisStream: 'darunrs.near/test_sweat_blockheight:real_time:stream',
        accountId: indexer.account_id,
        functionName: indexer.function_name,
        code: indexer.code,
        schema: indexer.schema
      }, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('start: ', response);
        }
      });
    }
    if (count === 7) {
      runnerClient.ListExecutors({}, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('list: ', response);
        }
      });
    }
    if (count === 9) {
      runnerClient.StopExecutor({
        executorId: 'darunrs sweat blockheight',
      }, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('stop: ', response);
        }
      });
    }
    count++;
    await sleep(1000);
  }
})();
