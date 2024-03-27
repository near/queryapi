// Run with 'npx ts-node src/test-client.ts'

import runnerClient from '../src/server/runner-client';

void (async function main () {
  runnerClient.ListExecutors({}, (err, response) => {
    if (err) {
      console.error('List request error: ', err);
    } else {
      console.log('Successful ListExecutors request: ', response);
    }
  });
})();
