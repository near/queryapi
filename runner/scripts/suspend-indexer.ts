// 1. Assert env vars
// 2. connect to coordinator
// 3. disable
// 4. log and set status?

/*
  * This script is used to suspend an indexer for a given account. It will:
  * 1. Call Coordinator to disable the indexer
  * 2. Write to the Indexers logs table to notify of suspension
  *
  * Usage: node suspend-indexer.ts <accountId> <functionName>
  * 
*/

const assert = require('assert');
const fs = require('fs');

const grpc = require('@grpc/grpc-js');
const protoLoader = require( '@grpc/proto-loader');

const COORDINATOR_PROTO_PATH = '../../coordinator/proto/indexer_manager.proto';

assert(exists(COORDINATOR_PROTO_PATH), 'Coordinator proto file not found. Make sure you run this script from the `./scripts` directory.');
assert(process.argv.length === 4, 'Usage: node suspend-indexer.ts <accountId> <functionName>');
assert(process.env.COORDINATOR_PORT, 'COORDINATOR_PORT env var is required');

const [_binary, _file, accountId, functionName] = process.argv;
const { COORDINATOR_PORT } = process.env;

main();

function main() {
  console.log(`Disabling indexer: ${accountId}/${functionName}\n`);

  const indexerManager = createIndexerManagerClient();

  indexerManager.diable({ accountId: 'morgs.near', functionName: 'sqs' }, console.log);
}

function exists(path) {
  try {
    fs.statSync(path);
    return true;
  } catch (err) {
    return false;
  }
}

function createIndexerManagerClient() {
  const packageDefinition = protoLoader.loadSync(COORDINATOR_PROTO_PATH);
  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  return new protoDescriptor.indexer.IndexerManager(`localhost:${COORDINATOR_PORT}`, grpc.credentials.createInsecure());
}
