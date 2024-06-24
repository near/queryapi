import { JsonRpcProvider } from '@near-js/providers'

import PgClient from '../src/pg-client'
import Provisioner from '../src/provisioner'
import { ProvisioningConfig } from '../src/indexer-config/indexer-config';

const rpcClient = new JsonRpcProvider({ url: 'https://rpc.mainnet.near.org' });
const pgClient = new PgClient({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT)
});
const provisioner = new Provisioner();

main();

type Registry = Record<string, Record<string, any>>;

async function main() {
  console.log('Fetching registry');
  const { result }: any = await rpcClient.sendJsonRpc('query', {
    account_id: process.env.REGISTRY_CONTRACT,
    finality: 'final',
    request_type: 'call_function',
    method_name: 'list_all',
    args_base64: 'e30='
  })

  const buffer = Buffer.from(result, 'base64')

  const registry: Registry = JSON.parse(buffer.toString())
  Object.keys(registry).forEach((accountId) => {
    console.log(`Account: ${accountId}`);
    console.log(Object.keys(registry[accountId]));
  })

  console.log('Fetching databases');
  const allDatabases = await pgClient.query(`
    SELECT d.datname
    FROM pg_catalog.pg_database d
    WHERE pg_catalog.pg_get_userbyid(d.datdba) = 'admin';
  `);

  const indexerDatabases = allDatabases.rows
    .map(({ datname }: any) => datname);

  for (const databaseName of indexerDatabases) {
    console.log('Processing database: ', databaseName)
    const userName = databaseName;
    console.log('Fetching schemas')
    const schemas = await provisioner.listUserOwnedSchemas(userName);
    for (const schemaName of schemas) {
      const [accountId, functionName] = schemaToIndexerDetails(schemaName);

      if (hasAssociatedConfig(registry, accountId, functionName)) {
        continue;
      }

      console.log(`Deprovisioning ${schemaName}`)

      const provisioningConfig = new ProvisioningConfig(accountId, functionName, 'schema - not needed');
      try {
        await provisioner.deprovision(provisioningConfig)
      } catch (error) {
        console.error(`Failed to deprovision ${schemaName}: ${error}`);
      }
    }
  }
}

function hasAssociatedConfig(registry: Registry, accountId: string, functionName: string): boolean {
  const registryFunctions = registry[accountId]
  if (!registryFunctions) {
    return false;
  }

  const functionKey = Object.keys(registryFunctions)
    .find((name) => name.replace(/[^a-zA-Z0-9]/g, '') === functionName.replace(/[^a-zA-Z0-9]/g, ''));

  if (!functionKey) {
    return false;
  }

  return true;
}

function schemaToIndexerDetails(schemaName: string): [string, string] {
  const [partialAccountName, functionName] = schemaName.split('_near_');

  return [`${partialAccountName}.near`, functionName]
}
