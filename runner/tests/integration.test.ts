import { Block, type StreamerMessage } from '@near-lake/primitives';
import { Network, type StartedNetwork } from 'testcontainers';
import { gql, GraphQLClient } from 'graphql-request';

import Indexer from '../src/indexer';
import HasuraClient from '../src/hasura-client';
import Provisioner from '../src/provisioner';
import PgClient from '../src/pg-client';

import { HasuraGraphQLContainer, type StartedHasuraGraphQLContainer } from './testcontainers/hasura';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './testcontainers/postgres';
import block115185108 from './blocks/00115185108/streamer_message.json';
import block115185109 from './blocks/00115185109/streamer_message.json';
import { LogLevel } from '../src/indexer-meta/log-entry';
import IndexerConfig from '../src/indexer-config';

describe('Indexer integration', () => {
  jest.setTimeout(300_000);

  let network: StartedNetwork;
  let postgresContainer: StartedPostgreSqlContainer;
  let hasuraContainer: StartedHasuraGraphQLContainer;
  let graphqlClient: GraphQLClient;

  beforeAll(async () => {
    network = await new Network().start();
    postgresContainer = await (await PostgreSqlContainer.build())
      .withNetwork(network)
      .start();
    hasuraContainer = await (await HasuraGraphQLContainer.build())
      .withNetwork(network)
      .withDatabaseUrl(postgresContainer.getConnectionUri(network.getName()))
      .start();
    graphqlClient = new GraphQLClient(`${hasuraContainer.getEndpoint()}/v1/graphql`, {
      headers: {
        'X-Hasura-Admin-Secret': hasuraContainer.getAdminSecret(),
      }
    });
  });

  afterAll(async () => {
    await postgresContainer.stop();
    await hasuraContainer.stop();
    await network.stop();
  });

  it('works', async () => {
    const hasuraClient = new HasuraClient({}, {
      adminSecret: hasuraContainer.getAdminSecret(),
      endpoint: hasuraContainer.getEndpoint(),
      pgHostHasura: postgresContainer.getIpAddress(network.getName()),
      pgPortHasura: postgresContainer.getPort(network.getName()),
      pgHost: postgresContainer.getIpAddress(),
      pgPort: postgresContainer.getPort()
    });

    const pgClient = new PgClient({
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
      host: postgresContainer.getIpAddress(),
      port: postgresContainer.getPort(),
      database: postgresContainer.getDatabase(),
    });

    const provisioner = new Provisioner(
      hasuraClient,
      pgClient,
      pgClient,
      {
        cronDatabase: postgresContainer.getDatabase(),
        postgresHost: postgresContainer.getIpAddress(),
        postgresPort: Number(postgresContainer.getPort()),
        pgBouncerHost: postgresContainer.getIpAddress(), // TODO: Enable pgBouncer in Integ Tests
        pgBouncerPort: Number(postgresContainer.getPort()),
      }
    );

    const code = `
      await context.graphql(
        \`
          mutation ($height:numeric){
            insert_morgs_near_test_blocks_one(object:{height:$height}) {
              height
            }
          }
        \`,
        {
          height: block.blockHeight
        }
      );
    `;
    const schema = 'CREATE TABLE blocks (height numeric)';

    const indexerConfig = new IndexerConfig(
      'test:stream',
      'morgs.near',
      'test',
      0,
      code,
      schema,
      LogLevel.INFO
    );

    const indexer = new Indexer(
      indexerConfig,
      {
        provisioner
      },
      undefined,
      {
        hasuraAdminSecret: hasuraContainer.getAdminSecret(),
        hasuraEndpoint: hasuraContainer.getEndpoint(),
      }
    );

    await indexer.execute(Block.fromStreamerMessage(block115185108 as any as StreamerMessage));

    await indexer.execute(Block.fromStreamerMessage(block115185109 as any as StreamerMessage));

    const { morgs_near_test_blocks: blocks }: any = await graphqlClient.request(gql`
      query {
        morgs_near_test_blocks {
          height
        }
      }
    `);

    expect(blocks.map(({ height }: any) => height)).toEqual([115185108, 115185109]);

    const { indexer_state: [state] }: any = await graphqlClient.request(gql`
      query {
        indexer_state(where: { function_name: { _eq: "morgs.near/test" } }) {
          current_block_height
          status
        }
      }
    `);

    expect(state.current_block_height).toEqual(115185109);
    expect(state.status).toEqual('RUNNING');

    const { indexer_log_entries: old_logs }: any = await graphqlClient.request(gql`
      query {
        indexer_log_entries(where: { function_name: { _eq:"morgs.near/test" } }) {
          message
        }
      }
    `);

    expect(old_logs.length).toEqual(4);

    const { morgs_near_test___logs: logs }: any = await graphqlClient.request(gql`
      query {
        morgs_near_test___logs {
          message
        }
      }
    `);

    expect(logs.length).toEqual(4);
    
    const { morgs_near_test___logs: provisioning_endpoints }: any = await graphqlClient.request(gql`
      query {
        morgs_near_test___logs(where: {message: {_ilike: "%Provisioning endpoint%"}}) {
          message
        }
      }
    `);
    
    expect(provisioning_endpoints.length).toEqual(2);

    const { morgs_near_test___logs: running_function_enpoint }: any = await graphqlClient.request(gql`
      query {
        morgs_near_test___logs(where: {message: {_ilike: "%Running function%"}}) {
          message
        }
      }
    `);
    
    expect(running_function_enpoint.length).toEqual(2);

  });

  it('test context db', async () => {
    const hasuraClient = new HasuraClient({}, {
      adminSecret: hasuraContainer.getAdminSecret(),
      endpoint: hasuraContainer.getEndpoint(),
      pgHostHasura: postgresContainer.getIpAddress(network.getName()),
      pgPortHasura: postgresContainer.getPort(network.getName()),
      pgHost: postgresContainer.getIpAddress(),
      pgPort: postgresContainer.getPort()
    });

    const pgClient = new PgClient({
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
      host: postgresContainer.getIpAddress(),
      port: postgresContainer.getPort(),
      database: postgresContainer.getDatabase(),
    });

    const provisioner = new Provisioner(
      hasuraClient,
      pgClient,
      pgClient,
      {
        cronDatabase: postgresContainer.getDatabase(),
        postgresHost: postgresContainer.getIpAddress(),
        postgresPort: Number(postgresContainer.getPort()),
        pgBouncerHost: postgresContainer.getIpAddress(), // TODO: Enable pgBouncer in Integ Tests
        pgBouncerPort: Number(postgresContainer.getPort()),
      }
    );

    const schema = `
      CREATE TABLE
        "indexer_storage" (
          "function_name" TEXT NOT NULL,
          "key_name" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          PRIMARY KEY ("function_name", "key_name")
        );
    `;

    const code = `
      await context.db.IndexerStorage.insert({
        function_name: "sample_indexer",
        key_name: Date.now().toString(),
        value: "testing_value"
      });
      await context.db.IndexerStorage.upsert({
        function_name: "sample_indexer",
        key_name: "test_key",
        value: "testing_value"
      }, ["function_name", "key_name"], ["value"]);
      await context.db.IndexerStorage.insert({
        function_name: "sample_indexer",
        key_name: "del_key",
        value: "del_value"
      });
      const result = await context.db.IndexerStorage.select({
        function_name: "sample_indexer",
        key_name: "del_key",
      });
      await context.db.IndexerStorage.update(
        {
          function_name: result[0].function_name,
          key_name: result[0].key_name,
        },
        {
          value: "updated_value"
        }
      );
      await context.db.IndexerStorage.delete({
        function_name: result[0].function_name,
        key_name: result[0].key_name,
        value: "updated_value"
      });
    `;

    const indexerConfig = new IndexerConfig(
      'test:stream',
      'morgs.near',
      'test-context-db',
      0,
      code,
      schema,
      LogLevel.INFO
    );

    const indexer = new Indexer(
      indexerConfig,
      {
        provisioner
      },
      undefined,
      {
        hasuraAdminSecret: hasuraContainer.getAdminSecret(),
        hasuraEndpoint: hasuraContainer.getEndpoint(),
      }
    );

    await indexer.execute(Block.fromStreamerMessage(block115185108 as any as StreamerMessage));
    await indexer.execute(Block.fromStreamerMessage(block115185109 as any as StreamerMessage));

    const { morgs_near_test_context_db_indexer_storage: sampleRows }: any = await graphqlClient.request(gql`
      query MyQuery {
        morgs_near_test_context_db_indexer_storage(where: {key_name: {_eq: "test_key"}, function_name: {_eq: "sample_indexer"}}) {
          function_name
          key_name
          value
        }
      }
    `);
    expect(sampleRows[0].value).toEqual('testing_value');

    const { morgs_near_test_context_db_indexer_storage: totalRows }: any = await graphqlClient.request(gql`
      query MyQuery {
        morgs_near_test_context_db_indexer_storage {
          function_name
          key_name
          value
        }
      }
    `);
    expect(totalRows.length).toEqual(3); // Two inserts, and the overwritten upsert
  });
});
