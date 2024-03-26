// Run with 'npx ts-node src/test-client.ts'

import runnerClient from '../src/server/runner-client';

// const schema = `
// CREATE TABLE
//   "indexer_storage" (
//     "function_name" TEXT NOT NULL,
//     "key_name" TEXT NOT NULL,
//     "value" TEXT NOT NULL,
//     PRIMARY KEY ("function_name", "key_name")
//   )
// `;

// const code = `
// console.log(context.db.IndexerStorage.select({
//   function_name: 'test_indexer'
// }));
// `;

// const indexer = {
//   account_id: 'darunrs.near',
//   redis_stream: 'test:block_stream',
//   function_name: 'test_indexer',
//   code,
//   start_block_height: 113448278,
//   schema,
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

void (async function main () {
  runnerClient.ListExecutors({}, (err, response) => {
    if (err) {
      console.error('error: ', err);
    } else {
      console.log('list request: ', response);
    }
  });
})();
