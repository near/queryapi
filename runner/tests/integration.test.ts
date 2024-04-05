import { Block, type StreamerMessage } from '@near-lake/primitives';
import { Network, type StartedNetwork } from 'testcontainers';
import fetch from 'node-fetch';

import Indexer from '../src/indexer';
import HasuraClient from '../src/hasura-client';
import Provisioner from '../src/provisioner';
import PgClient from '../src/pg-client';
import { LogLevel } from '../src/indexer-logger/indexer-logger';

import { HasuraGraphQLContainer, type StartedHasuraGraphQLContainer } from './testcontainers/hasura';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './testcontainers/postgres';
import block1 from './blocks/00115185108/streamer_message.json';

describe('Indexer integration', () => {
  jest.setTimeout(300_000);

  let network: StartedNetwork;
  let postgresContainer: StartedPostgreSqlContainer;
  let hasuraContainer: StartedHasuraGraphQLContainer;

  beforeAll(async () => {
    network = await new Network().start();
    postgresContainer = await (await PostgreSqlContainer.build())
      .withNetwork(network)
      .start();
    hasuraContainer = await (await HasuraGraphQLContainer.build())
      .withNetwork(network)
      .withDatabaseUrl(postgresContainer.getConnectionUri(network.getName()))
      .start();
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
      }
    );

    await indexer.runFunctions(
      Block.fromStreamerMessage(block1 as any as StreamerMessage),
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

    const e = hasuraContainer.getEndpoint();
    const resp = await fetch(`${e}/v1/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hasura-Role': 'morgs_near',
        'X-Hasura-Admin-Secret': hasuraContainer.getAdminSecret() // required as there is no configured auth hook
      },
      body: JSON.stringify({
        query: `
          query {
            morgs_near_test_blocks {
              height
            }
          }
        `
      })
    });

    const { data } = await resp.json();

    expect(data.morgs_near_test_blocks[0].height).toEqual(115185108);
  });
});
