// Run with 'npx ts-node src/test-client.ts'

import runnerClient from '../src/server/services/runner/runner-client';

runnerClient.StopExecutor({
  executorId: '0293a6b1dcd2259a8be6b59a8cd3e7b4285e540a64a7cbe99639947f7b7e2f9a'
}, (err, response) => {
  if (err) {
    console.error('error: ', err);
  } else {
    console.log('stop request: ', JSON.stringify({ response }, null, 2));
  }
});
