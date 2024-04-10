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
        hasuraHostOverride: postgresContainer.getIpAddress(),
        hasuraPortOverride: Number(postgresContainer.getPort()),
      }
    );

    const indexer = new Indexer(
      {
        log_level: LogLevel.INFO,
      },
      {
        provisioner
      },
      undefined,
      {
        hasuraAdminSecret: hasuraContainer.getAdminSecret(),
        hasuraEndpoint: hasuraContainer.getEndpoint(),
        hasuraHostOverride: postgresContainer.getIpAddress(),
        hasuraPortOverride: Number(postgresContainer.getPort())
      }
    );

    await indexer.runFunctions(
      Block.fromStreamerMessage(block115185108 as any as StreamerMessage),
      {
        'morgs.near/test': {
          account_id: 'morgs.near',
          function_name: 'test',
          provisioned: false,
          schema: 'CREATE TABLE blocks (height numeric)',
          code: `
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
          `,
        }
      },
      false,
      {
        provision: true
      }
    );

    await indexer.runFunctions(
      Block.fromStreamerMessage(block115185109 as any as StreamerMessage),
      {
        'morgs.near/test': {
          account_id: 'morgs.near',
          function_name: 'test',
          provisioned: false,
          schema: 'CREATE TABLE blocks (height numeric)',
          code: `
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
          `,
        }
      },
      false,
      {
        provision: true
      }
    );

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

    const { indexer_log_entries: logs }: any = await graphqlClient.request(gql`
      query {
        indexer_log_entries(where: { function_name: { _eq:"morgs.near/test" } }) {
          message
        }
      }
    `);

    expect(logs.length).toEqual(4);
  });
});
