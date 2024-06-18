import { Block, type StreamerMessage } from '@near-lake/primitives';
import { Network, type StartedNetwork } from 'testcontainers';
import { gql, GraphQLClient } from 'graphql-request';

import Indexer from '../src/indexer';
import HasuraClient from '../src/hasura-client';
import Provisioner from '../src/provisioner';
import PgClient from '../src/pg-client';

import { HasuraGraphQLContainer, type StartedHasuraGraphQLContainer } from './testcontainers/hasura';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './testcontainers/postgres';
import block_115185108 from './blocks/00115185108/streamer_message.json';
import block_115185109 from './blocks/00115185109/streamer_message.json';
import { LogLevel } from '../src/indexer-meta/log-entry';
import IndexerConfig from '../src/indexer-config';

describe('Indexer integration', () => {
  jest.setTimeout(300_000);

  let hasuraClient: HasuraClient;
  let pgClient: PgClient;
  let provisioner: Provisioner;

  let network: StartedNetwork;
  let postgresContainer: StartedPostgreSqlContainer;
  let hasuraContainer: StartedHasuraGraphQLContainer;
  let graphqlClient: GraphQLClient;

  beforeEach(async () => {
    hasuraClient = new HasuraClient({}, {
      adminSecret: hasuraContainer.getAdminSecret(),
      endpoint: hasuraContainer.getEndpoint(),
      pgHostHasura: postgresContainer.getIpAddress(network.getName()),
      pgPortHasura: postgresContainer.getPort(network.getName()),
      pgHost: postgresContainer.getIpAddress(),
      pgPort: postgresContainer.getPort()
    });

    pgClient = new PgClient({
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
      host: postgresContainer.getIpAddress(),
      port: postgresContainer.getPort(),
      database: postgresContainer.getDatabase(),
    });

    provisioner = new Provisioner(
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
  });

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
    const indexerCode = `
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
    const blocksIndexerQuery = gql`
      query {
        morgs_near_test_blocks {
          height
        }
      }
    `;
    const schema = 'CREATE TABLE blocks (height numeric)';

    const indexerConfig = new IndexerConfig(
      'test:stream',
      'morgs.near',
      'test',
      0,
      indexerCode,
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

    await provisioner.provisionUserApi(indexerConfig);

    await indexer.execute(Block.fromStreamerMessage(block_115185108 as any as StreamerMessage));

    const firstHeight = await indexerBlockHeightQuery('morgs_near_test', graphqlClient);
    expect(firstHeight.value).toEqual('115185108');

    await indexer.execute(Block.fromStreamerMessage(block_115185109 as any as StreamerMessage));

    const secondStatus = await indexerStatusQuery('morgs_near_test', graphqlClient);
    expect(secondStatus.value).toEqual('RUNNING');
    const secondHeight: any = await indexerBlockHeightQuery('morgs_near_test', graphqlClient);
    expect(secondHeight.value).toEqual('115185109');

    const logs: any = await indexerLogsQuery('morgs_near_test', graphqlClient);
    expect(logs.length).toEqual(2);

    const { morgs_near_test_blocks: blocks }: any = await graphqlClient.request(blocksIndexerQuery);
    expect(blocks.map(({ height }: any) => height)).toEqual([115185108, 115185109]);
  });

  it('test context db', async () => {
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
    const queryAllRows = gql`
      query MyQuery {
        morgs_near_test_context_db_indexer_storage {
          function_name
          key_name
          value
        }
      }
    `;
    const queryTestKeyRows = gql`
      query MyQuery {
        morgs_near_test_context_db_indexer_storage(where: {key_name: {_eq: "test_key"}, function_name: {_eq: "sample_indexer"}}) {
          function_name
          key_name
          value
        }
      }
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

    await provisioner.provisionUserApi(indexerConfig);

    await indexer.execute(Block.fromStreamerMessage(block_115185108 as any as StreamerMessage));
    await indexer.execute(Block.fromStreamerMessage(block_115185109 as any as StreamerMessage));

    const { morgs_near_test_context_db_indexer_storage: sampleRows }: any = await graphqlClient.request(queryTestKeyRows);
    expect(sampleRows[0].value).toEqual('testing_value');

    const { morgs_near_test_context_db_indexer_storage: totalRows }: any = await graphqlClient.request(queryAllRows);
    expect(totalRows.length).toEqual(3); // Two inserts, and the overwritten upsert
  });

  it('deprovisions', async () => {
    const indexerConfig = new IndexerConfig(
      'test:stream',
      'morgs.near',
      'test-provisioning',
      0,
      '',
      'CREATE TABLE blocks (height numeric)',
      LogLevel.INFO
    );

    await provisioner.provisionUserApi(indexerConfig);
    await provisioner.deprovision(indexerConfig);
  });
});

async function indexerLogsQuery (indexerSchemaName: string, graphqlClient: GraphQLClient): Promise<any> {
  const graphqlResult: any = await graphqlClient.request(gql`
    query {
      ${indexerSchemaName}_sys_logs {
        message
      }
    }
  `);
  return graphqlResult[`${indexerSchemaName}_sys_logs`];
}

async function indexerStatusQuery (indexerSchemaName: string, graphqlClient: GraphQLClient): Promise<any> {
  return await indexerMetadataQuery(indexerSchemaName, 'STATUS', graphqlClient);
}

async function indexerBlockHeightQuery (indexerSchemaName: string, graphqlClient: GraphQLClient): Promise<any> {
  return await indexerMetadataQuery(indexerSchemaName, 'LAST_PROCESSED_BLOCK_HEIGHT', graphqlClient);
}

async function indexerMetadataQuery (indexerSchemaName: string, attribute: string, graphqlClient: GraphQLClient): Promise<any> {
  const graphqlResult: any = await graphqlClient.request(gql`
    query {
      ${indexerSchemaName}_sys_metadata(where: {attribute: {_eq: "${attribute}"}}) {
        attribute
        value
      }
    }
  `);
  return graphqlResult[`${indexerSchemaName}_sys_metadata`][0];
}
