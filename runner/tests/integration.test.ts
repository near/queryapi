import { Block, type StreamerMessage } from '@near-lake/primitives';
import { Network, type StartedNetwork } from 'testcontainers';
import { Readable } from 'stream';

import Indexer from '../src/indexer';
import HasuraClient from '../src/hasura-client';
import Provisioner from '../src/provisioner';
import PgClient from '../src/pg-client';
import { LogLevel } from '../src/stream-handler/stream-handler';

import { HasuraGraphQLContainer, type StartedHasuraGraphQLContainer } from './testcontainers/hasura';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './testcontainers/postgres';
import block1 from './blocks/00115185108/streamer_message.json';

const logConsumer = (stream: Readable): void => {
  const readable = new Readable().wrap(stream);
  readable.on('data', (chunk) => {
    console.log(chunk.toString()); // Print the log output
  });
};

describe('something', () => {
  jest.setTimeout(600000);

  let network: StartedNetwork;
  let postgresContainer: StartedPostgreSqlContainer;
  let hasuraContainer: StartedHasuraGraphQLContainer;

  beforeAll(async () => {
    network = await new Network().start();
    postgresContainer = await new PostgreSqlContainer('postgres:14')
      .withNetwork(network)
      .withLogConsumer(logConsumer)
      .start();
    hasuraContainer = await (await HasuraGraphQLContainer.build())
      .withNetwork(network)
      .withAdminSecret('123')
      .withDatabaseUrl(postgresContainer.getConnectionUri(network.getName()))
      .withLogConsumer(logConsumer)
      .start();
  });

  afterAll(async () => {
    await postgresContainer.stop();
    // TODO implement stop on container - wait I shouldn't need to since it returns a started container
    await hasuraContainer.stop();
    await network.stop();
  });

  it('hi', async () => {
    const hasuraClient = new HasuraClient({}, {
      adminSecret: hasuraContainer.getAdminSecret(),
      endpoint: hasuraContainer.getEndpoint(),
      pgHost: postgresContainer.getIpAddress(network.getName()),
      pgPort: postgresContainer.getPort(network.getName())
    });

    const pgClient = new PgClient({
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
      host: postgresContainer.getIpAddress(),
      port: postgresContainer.getPort(),
      database: postgresContainer.getDatabase(),
    });

    const provisioner = new Provisioner(hasuraClient, pgClient);

    // await provisioner.provisionUserApi('morgs.near', 'test', 'CREATE TABLE blocks (height numeric)');
    //
    // const { username, password, database } = await hasuraClient.getDbConnectionParameters('morgs_near');
    //
    // const morgsNearPgClient = new PgClient({
    //   password,
    //   database,
    //   user: username,
    //   host: postgresContainer.getIpAddress(),
    //   port: postgresContainer.getPort(),
    // });
    //
    // await morgsNearPgClient.query('SELECT * FROM morgs_near_test.blocks');
    await new Promise(r => setTimeout(r, 100000));

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

    // TODO for some reason calls to hasura graphql are still failing
    await indexer.runFunctions(
      Block.fromStreamerMessage(block1 as any as StreamerMessage),
      {
        'morgs.near/test': {
          account_id: 'morgs.near',
          function_name: 'test',
          provisioned: false,
          schema: 'CREATE TABLE blocks (height numeric)',
          code: 'console.log("hi")',
        }
      },
      false,
      {
        provision: true
      }
    );

    // TODO set up Indexer and test it
    // 1. feed in static block
    // 2. assert output via graphql
  });
});
