// export HASURA_ENDPOINT=''
// export HASURA_ADMIN_SECRET=''
// export PG_ADMIN_USER=''
// export PG_ADMIN_PASSWORD=''
// export PG_ADMIN_DATABASE=''
// export PG_HOST=''
// export PG_PORT=

import { execSync } from 'child_process'
import { providers } from 'near-api-js'

import Provisioner from '../provisioner.js'
import HasuraClient from '../hasura-client.js'

const provisioner = new Provisioner();

const { rows } = await provisioner.pgClient.query('SELECT nspname AS name FROM pg_namespace;')

const schemaNames = rows.map((row) => row.name);

const accountIdsSet = schemaNames.reduce((accountIdsSet, schemaName) => {
    const parts = schemaName.split('_near_');
    if (parts.length > 1) {
        accountIdsSet.add(`${parts[0]}_near`);
    }
    return accountIdsSet;
}, new Set());

const accountIds = ['morgs.near', 'flatirons.near', 'roshaan.near', 'dataplatform.near'];

console.log(`Creating datasources for accounts: ${accountIds.join(', ')}`)

for (const accountId of accountIds) {
    console.log('---');
    const sanitizedAccountId = provisioner.replaceSpecialChars(accountId);

    const databaseName = sanitizedAccountId;
    const userName = sanitizedAccountId;

    if (await provisioner.hasuraClient.doesSourceExist(databaseName)) {
        console.log(`Datasource ${databaseName} already exists, skipping.`)
        continue;
    }

    const password = provisioner.generatePassword()
    console.log(`Creating user: ${userName} and database: ${databaseName} with password: ${password}`);
    await provisioner.createUserDb(userName, password, databaseName);

    console.log(`Adding datasource ${databaseName} to Hasura`)
    await provisioner.addDatasource(userName, password, databaseName);
}
console.log('---');

console.log('Done');
