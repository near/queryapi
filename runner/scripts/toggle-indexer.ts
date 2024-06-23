// 1. Assert env vars
// 2. connect to coordinator
// 3. disable
// 4. log and set status?

const grpc = require('@grpc/grpc-js');
const protoLoader = require( '@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('../../coordinator/proto/indexer_manager.proto');
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

const indexerManager = new protoDescriptor.indexer.IndexerManager('localhost:8002', grpc.credentials.createInsecure());

indexerManager.disable({ accountId: 'morgs.near', functionName: 'sqs' }, console.log);
