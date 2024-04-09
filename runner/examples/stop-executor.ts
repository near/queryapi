// Run with 'npx ts-node src/test-client.ts'

import runnerClient from '../src/server/runner-client';

runnerClient.StopExecutor({
  executorId: 'SOME_EXECUTOR_ID'
}, (err, response) => {
  if (err) {
    console.error('error: ', err);
  } else {
    console.log('stop request: ', response);
  }
});
