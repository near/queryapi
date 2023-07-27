// export HASURA_ENDPOINT='https://queryapi-hasura-graphql-vcqilefdcq-ew.a.run.app'
// export HASURA_ADMIN_SECRET=''
// export PG_ADMIN_USER='hasura'
// export PG_ADMIN_PASSWORD=''
// export PG_ADMIN_DATABASE='postgres'
// export PG_HOST=''
// export PG_PORT=5432
// export CHAIN_ID='mainnet'
// export ENV='dev'

import { execSync } from 'child_process'
import { providers } from 'near-api-js'

import Provisioner from '../provisioner.js'
import HasuraClient from '../hasura-client.js'

const provisioner = new Provisioner();

if (!process.argv[2]) {
    console.error('Please pass the account ID as the first argument, e.g. dataplatform.near');
    process.exit(1);
}

if (!process.argv[3]) {
    console.error('Please pass the function name as the second argument, e.g. social_feed')
    process.exit(1);
}

const [_, __, accountId, functionName] = process.argv;

console.log(`Processing account: ${accountId}, function: ${functionName}`);

const provider = new providers.JsonRpcProvider(
    `https://rpc.${process.env.CHAIN_ID}.near.org`
);

console.log('Fetching existing schema');
const { result: rawResult } = await provider.query({
    request_type: 'call_function',
    account_id: `${process.env.ENV === 'prod' ? '' : 'dev-'}queryapi.dataplatform.near`,
    method_name: 'list_indexer_functions',
    args_base64: Buffer.from(JSON.stringify({ account_id: accountId})).toString('base64'),
    finality: 'optimistic',
});

const result = JSON.parse(Buffer.from(rawResult).toString());

const { schema: databaseSchema } = result.Account[functionName];
console.log('Using schema: ', databaseSchema);

const sanitizedAccountId = provisioner.replaceSpecialChars(accountId);
const sanitizedFunctionName = provisioner.replaceSpecialChars(functionName);

const databaseName = sanitizedAccountId;
const userName = sanitizedAccountId;
const schemaName = `${sanitizedAccountId}_${sanitizedFunctionName}`;

const password = provisioner.generatePassword()
if (!await provisioner.hasuraClient.doesSourceExist(databaseName)) {
    console.log(`Creating user: ${userName} and database: ${databaseName} with password: ${password}`);
    await provisioner.createUserDb(userName, password, databaseName);
    console.log('Adding datasource to Hasura')
    await provisioner.addDatasource(userName, password, databaseName);
}

const tableNames = await provisioner.getTableNames(schemaName, HasuraClient.DEFAULT_DATABASE);

console.log('Untracking existing tables')
await provisioner.hasuraClient.untrackTables(HasuraClient.DEFAULT_DATABASE, schemaName, tableNames);

console.log(`Restoring existing schema ${schemaName} in new DB ${databaseName}`);
await provisioner.createSchema(databaseName, schemaName);
await provisioner.runMigrations(databaseName, schemaName, databaseSchema);

console.log('Dumping existing data');
execSync(
    `pg_dump ${`postgres://${process.env.PG_ADMIN_USER}:${process.env.PG_ADMIN_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_ADMIN_DATABASE}`} --data-only --schema=${schemaName} --file="${schemaName}.sql"`
);

console.log(`Restoring data to schema ${schemaName} in DB ${databaseName}`);
execSync(
    `psql ${`postgres://${userName}:${password}@${process.env.PG_HOST}:${process.env.PG_PORT}/${databaseName}`} < "${schemaName}.sql"`
);

console.log('Tracking tables');
await provisioner.trackTables(schemaName, tableNames, databaseName);

console.log('Tracking foreign key relationships');
await provisioner.trackForeignKeyRelationships(schemaName, databaseName);

console.log('Adding permissions to tables');
await provisioner.addPermissionsToTables(schemaName, databaseName, tableNames, userName, ['select', 'insert', 'update', 'delete']);

console.log('done')
