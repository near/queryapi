process.env.HASURA_ENDPOINT = 'http://localhost:8080'
process.env.HASURA_ADMIN_SECRET = 'myadminsecretkey'

process.env.PG_ADMIN_USER = 'postgres'
process.env.PG_ADMIN_PASSWORD = 'postgrespassword'
process.env.PG_ADMIN_DATABASE = 'postgres'
process.env.PG_HOST = 'localhost'
process.env.PG_PORT = 5432

process.env.CHAIN_ID = 'mainnet'
process.env.ENV = 'dev'

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
const schemaName = sanitizedFunctionName;

const existingSchemaName = `${sanitizedAccountId}_${sanitizedFunctionName}`;

if (!await provisioner.hasuraClient.doesSourceExist(databaseName)) {
    const password = provisioner.generatePassword()
    console.log(`Creating user: ${userName} and database: ${databaseName} with password: ${password}`);
    await provisioner.createUserDb(userName, password, databaseName);
    console.log('Adding datasource to Hasura')
    await provisioner.addDatasource(userName, password, databaseName);
}

const tableNames = await provisioner.getTableNames(existingSchemaName, HasuraClient.DEFAULT_DATABASE);

console.log('Untracking existing tables')
await provisioner.hasuraClient.untrackTables(HasuraClient.DEFAULT_DATABASE, existingSchemaName, tableNames);

console.log(`Restoring existing schema ${existingSchemaName} in new DB ${databaseName}`);
await provisioner.createSchema(databaseName, existingSchemaName);
await provisioner.runMigrations(databaseName, existingSchemaName, databaseSchema);

console.log('Dumping existing data');
execSync(`pg_dump --data-only --schema=${existingSchemaName} --file="${existingSchemaName}.sql"`);

console.log(`Restoring data to schema ${existingSchemaName} in DB ${databaseName}`);
execSync(`psql --dbname=${databaseName} < "${existingSchemaName}.sql"`);

console.log(`Renaming schema ${existingSchemaName} to ${schemaName}`);
execSync(`psql --dbname=${databaseName} --command="ALTER SCHEMA \"${existingSchemaName}\" RENAME TO \"${schemaName}\";"`)

console.log('Tracking tables');
await provisioner.trackTables(schemaName, tableNames, databaseName);

console.log('Tracking foreign key relationships');
await provisioner.trackForeignKeyRelationships(schemaName, databaseName);

console.log('Adding permissions to tables');
await provisioner.addPermissionsToTables(schemaName, databaseName, tableNames, userName, ['select', 'insert', 'update', 'delete']);

console.log('done')
