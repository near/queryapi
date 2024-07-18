// Run with 'npx ts-node src/test-client.ts'

import runnerClient from '../src/server/services/runner/runner-client';

void (async function main () {
  runnerClient.ListExecutors({}, (err, response) => {
    if (err) {
      console.error('List request error: ', err);
    } else {
      console.log('list response: ', JSON.stringify({ response }, null, 2));
    }
  });
})();
