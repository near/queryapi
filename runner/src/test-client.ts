// Run with 'npx ts-node src/test-client.ts'
// import crypto from 'crypto';

import runnerClient from './runner-client';
// import RedisClient from './redis-client';

// const hashString = (input: string): string => {
//   const hash = crypto.createHash('sha256');
//   hash.update(input);
//   return hash.digest('hex');
// };

// const redisClient = new RedisClient();

// const darunrsSweatId = hashString('darunrs.near/test_sweat_blockheight');

const indexer = {
  account_id: 'darunrs.near',
  redis_stream: 'darunrs.near/test_sweat_blockheight:real_time:stream',
  function_name: 'test_sweat_blockheight',
  code: '\n  const h = block.header().height;\n',
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

// const indexerB = {
//   account_id: 'flatirons.near',
//   redis_stream: 'flatirons.near/sweat_blockheight:real_time:stream',
//   function_name: 'sweat_blockheight',
//   code: '\n  const h = block.header().height;\n',
//   start_block_height: 106881495,
//   schema: 'CREATE TABLE\n' +
//       '  "indexer_storage" (\n' +
//       '    "function_name" TEXT NOT NULL,\n' +
//       '    "key_name" TEXT NOT NULL,\n' +
//       '    "value" TEXT NOT NULL,\n' +
//       '    PRIMARY KEY ("function_name", "key_name")\n' +
//       '  )\n',
//   provisioned: true,
//   indexer_rule: {
//     indexer_rule_kind: 'Action',
//     matching_rule: {
//       rule: 'ACTION_ANY',
//       affected_account_id: 'token.sweat',
//       status: 'SUCCESS'
//     },
//     id: null,
//     name: null
//   }
// };

const updateCode = '\n  const h = block.header().height;';

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

void (async function main () {
  runnerClient.StartExecutor({
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
  await sleep(500);

  runnerClient.ListExecutors({}, (err, response) => {
    if (err) {
      console.error('error: ', err);
    } else {
      console.log('list: ', response);
    }
  });

  // runnerClient.StopExecutor({
  //   executorId: darunrsSweatId,
  // }, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('stop: ', response);
  //   }
  // });
  await sleep(5000);

  indexer.code = updateCode; // Change Indexer code to not run mutations, which will change logging output once deployed again
  runnerClient.ListExecutors({}, (err, response) => {
    if (err) {
      console.error('error: ', err);
    } else {
      console.log('list: ', response);
    }
  });

  // runnerClient.StartExecutor({
  //   redisStream: 'darunrs.near/test_sweat_blockheight:real_time:stream',
  //   accountId: indexer.account_id,
  //   functionName: indexer.function_name,
  //   code: indexer.code,
  //   schema: indexer.schema
  // }, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('start: ', response);
  //   }
  // });
  // await sleep(500);

  // runnerClient.ListExecutors({}, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('list: ', response);
  //   }
  // });

  // // console.log('Removing stream from set');
  // // await redisClient.removeSetMember('flatirons.near/sweat_blockheight:real_time:stream');
  // runnerClient.StopExecutor({
  //   executorId: 'flatirons.near/sweat_blockheight:real_time:stream',
  // }, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('stop: ', response);
  //   }
  // });
  // await sleep(500);

  // runnerClient.StopExecutor({
  //   executorId: darunrsSweatId,
  // }, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('stop: ', response);
  //   }
  // });
  // await sleep(500);

  // runnerClient.ListExecutors({}, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('list: ', response);
  //   }
  // });
  // // console.log('Adding stream to set');
  // // await redisClient.addSetMember('flatirons.near/sweat_blockheight:real_time:stream');
  // await sleep(2000);

  // runnerClient.ListExecutors({}, (err, response) => {
  //   if (err) {
  //     console.error('error: ', err);
  //   } else {
  //     console.log('list: ', response);
  //   }
  // });
})();
