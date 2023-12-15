import runnerClient from './service/runner-client';

const indexer = {
  account_id: 'darunrs.near',
  redis_stream: 'darunrs.near/test_sweat_blockheight:real_time:stream',
  function_name: 'test_sweat_blockheight',
  code: "\n  const h = block.header().height;\n  await context.set('height', h);\n",
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

const updateCode = '\n  const h = block.header().height;\n';

const sleep = async (ms: number): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, ms)); };

void (async function main () {
  let count = 0;
  while (count < 20) {
    if (count === 4) {
      runnerClient.StartStream({
        streamId: 'darunrs sweat blockheight',
        redisStream: indexer.redis_stream,
        indexerConfig: JSON.stringify(indexer)
      }, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('start: ', response);
        }
      });
    }
    if (count === 9) {
      indexer.code = updateCode;
      runnerClient.UpdateStream({
        streamId: 'darunrs sweat blockheight',
        indexerConfig: JSON.stringify(indexer)
      }, (err, response) => {
        if (err) {
          console.error('error: ', err);
        } else {
          console.log('update: ', response);
        }
      });
    }
    if (count === 14) {
      indexer.code = updateCode;
      runnerClient.StopStream({
        streamId: 'darunrs sweat blockheight',
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
