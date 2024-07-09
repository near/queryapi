/*
  * This script is used to suspend an indexer for a given account. It will:
  * 1. Call Coordinator to disable the indexer
  * 2. Write to the Indexers logs table to notify of suspension
  *
  * Note that as Coordinator is in a private network, you must tunnel to the machine to expose the gRPC server.
  * This can be achieved via running the following in a separate terminal:
  * ```sh
  * gcloud compute ssh ubuntu@queryapi-coordinator-mainnet -- -L 9003:0.0.0.0:9003
  * ```
  *
  * The following environment variables are required:
  * - `HASURA_ADMIN_SECRET`
  * - `HASURA_ENDPOINT`
  * - `PGPORT`
  * - `PGHOST`
  *
  * All of which can be found in the Runner compute instance metadata:
  * ```sh
  * gcloud compute instances describe queryapi-runner-mainnet
  * ```
  *
  *
  * Usage: npm run script:suspend-indexer -- <accountId> <functionName>
*/

import assert from 'assert'
import * as fs from 'fs'

import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'

import Provisioner from '../src/provisioner'
import IndexerConfig from '../src/indexer-config'
import IndexerMeta, { LogEntry } from '../src/indexer-meta';

const COORDINATOR_PROTO_PATH = '../coordinator/proto/indexer_manager.proto';

assert(exists(COORDINATOR_PROTO_PATH), 'Coordinator proto file not found. Make sure you run this script from the root directory.');
assert(process.argv.length === 4, 'Usage: npm run script:suspend-indexer -- <accountId> <functionName>');
assert(process.env.COORDINATOR_PORT, 'COORDINATOR_PORT env var is required');
assert(process.env.HASURA_ADMIN_SECRET, 'HASURA_ADMIN_SECRET env var is required');
assert(process.env.HASURA_ENDPOINT, 'HASURA_ENDPOINT env var is required');
assert(process.env.PGPORT, 'PGPORT env var is required');
assert(process.env.PGHOST, 'PGHOST env var is required');

const [_binary, _file, accountId, functionName] = process.argv;
const { COORDINATOR_PORT = 9003 } = process.env;

main();

async function main() {
  await suspendIndexer();
  await logSuspension();

  console.log('Done')
}

async function logSuspension() {
  console.log('Logging suspension notification');

  const config = new IndexerConfig('not needed', accountId, functionName, 0, 'not needed', 'not needed', 2);

  const pgCredentials = await new Provisioner().getPostgresConnectionParameters(config.userName());

  await new IndexerMeta(config, pgCredentials).writeLogs([
    LogEntry.systemInfo('The indexer is suspended due to inactivity.'),
  ]);
}

async function suspendIndexer() {
  console.log(`Suspending indexer: ${accountId}/${functionName}`);

  const indexerManager = createIndexerManagerClient();

  return new Promise((resolve, reject) => {
    indexerManager.disable({ accountId, functionName }, (err: any, response: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  })
}

function exists(path: string): boolean {
  try {
    fs.statSync(path);
    return true;
  } catch (err) {
    return false;
  }
}

function createIndexerManagerClient() {
  const packageDefinition = protoLoader.loadSync(COORDINATOR_PROTO_PATH);
  const protoDescriptor: any = grpc.loadPackageDefinition(packageDefinition);
  return new protoDescriptor.indexer.IndexerManager(`localhost:${COORDINATOR_PORT}`, grpc.credentials.createInsecure());
}
