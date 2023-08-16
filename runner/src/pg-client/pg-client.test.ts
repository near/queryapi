import PgClient from './pg-client';

describe('Postgres Client Tests', () => {
  let hasuraClient: any;
  const testUsers = {
    testA_near: 'passA',
    testB_near: 'passB',
    testC_near: 'passC'
  };
  const TEST_METADATA = generateMetadata(testUsers);
  const testPgClient = {
    user: 'user',
    password: 'password',
    database: 'database',
    host: 'host',
    port: 'port',
  };

  beforeEach(() => {
    hasuraClient = {
      exportMetadata: jest.fn().mockReturnValue(TEST_METADATA)
    };
  });

  test('Test set user', async () => {
    const pgClient = new PgClient(testPgClient, hasuraClient);
    await pgClient.setUser('testA_near');
    await expect(pgClient.setUser('fake_near')).rejects.toThrow('Could not find password for user fake_near when trying to set user account to process database actions.');
  });
});

function generateMetadata (testUsers: any): any {
  const sources = [];
  // Insert default source which has different format than the rest
  sources.push({
    name: 'default',
    kind: 'postgres',
    tables: [],
    configuration: {
      connection_info: {
        database_url: { from_env: 'HASURA_GRAPHQL_DATABASE_URL' },
        isolation_level: 'read-committed',
        pool_settings: {
          connection_lifetime: 600,
          idle_timeout: 180,
          max_connections: 50,
          retries: 1
        },
        use_prepared_statements: true
      }
    }
  });

  Object.keys(testUsers).forEach((user) => {
    sources.push(generateSource(user, testUsers[user]));
  });

  console.log(sources);

  return {
    version: 3,
    sources
  };
}

function generateSource (user: string, password: string): any {
  return {
    name: user,
    kind: 'postgres',
    tables: [],
    configuration: {
      connection_info: {
        database_url: { connection_parameters: generateConnectionParameter(user, password) },
        isolation_level: 'read-committed',
        use_prepared_statements: false
      }
    }
  };
}

function generateConnectionParameter (user: string, password: string): any {
  return {
    database: user,
    host: 'postgres',
    password,
    port: 5432,
    username: user
  };
}
