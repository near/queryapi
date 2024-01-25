# QueryApi

With QueryApi you can
* Write your own custom indexer function at https://near.org/dataplatform.near/widget/QueryApi.Dashboard;
* Specify the schema for your own custom hosted database and write to it with your indexer function;
* Retrieve that data through a GraphQL API.

## 🧩 Components
1. [QueryApi Coordinator](./indexer)
An Indexer that tracks changes to the QueryApi registry contract. It triggers the execution of those IndexerFunctions
when they match new blocks by placing messages on a Redis Stream. Spawns historical processing threads when needed.
   1.a.  Subfolders provide crates for the different components of the Indexer: indexer_rule_type (shared with registry contract), 
indexer_rules_engine, storage.
2. [Indexer Runner](.indexer-js-queue-handler)
   Retrieves messages from the SQS queue, fetches the matching block and executes the IndexerFunction.
3. [Runner](.runner)
   Retrieves messages from Redis Stream, fetching matching block and executes the IndexerFunction.
3. [IndexerFunction Editor UI](./frontend)
   Serves the editor UI within the dashboard widget and mediates some communication with the GraphQL DB and block server.
4. [Hasura Authentication Service](./hasura-authentication-service)
   Provides authentication for the Hasura GraphQL server.
5. [IndexerFunction Registry Contract](./registry)
   Stores IndexerFunctions, their schemas and execution parameters like start block height.
6. [Lake Block server](./block-server)
   Serves blocks from the S3 lake for in browser testing of IndexerFunctions.

## 🚀 Getting Started

The majority of the QueryApi components can be set up locally using Docker. For this purpose, a [Docker Compose file](./docker-compose.yml) has been provided. However, the local system still relies on the NEAR Mainnet, rather than running on a localnet.

### Requirements
- [Docker](https://docs.docker.com/engine/install/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Hasura CLI](https://hasura.io/docs/latest/hasura-cli/install-hasura-cli/)
- AWS Access Keys

### AWS Credentials Setup
QueryApi requires AWS credentials to stream blocks from [NEAR Lake](https://github.com/near/near-lake-indexer). Credentials are exposed via the following environment variables, which can be found in the Docker Compose file:

Runner:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Coordinator:
- `LAKE_AWS_ACCESS_KEY`
- `LAKE_AWS_SECRET_ACCESS_KEY`
- `QUEUE_AWS_ACCESS_KEY`
- `QUEUE_AWS_SECRET_ACCESS_KEY`

These should be populated with your credentials. In most cases, the same key pair can be used for all 3 sets of credentials. Just ensure the keys have permissions to access S3 for handling [Requestor Pays](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RequesterPaysBuckets.html) in Near Lake. 

### Hasura Configuration
Hasura contains shared tables for e.g. logging and setting arbitrary state. These tables must be configured prior to running the entire QueryApi application. Configuration is stored in the `hasura/` directory and deployed through the Hasura CLI.

To configure Hasura, first start it with:
```sh
docker compose up hasura-graphql --detach
```

And apply the configuration with:
```sh
cd ./hasura && hasura deploy
```

### Running QueryApi
With everything configured correctly, we can now start all components of QueryApi with:
```sh
docker compose up
```

### Local Configuration
- Coordinator watches the dev registry contract by default (`dev-queryapi.dataplatform.near`). To use a different contract, you can update the `REGISTRY_CONTRACT_ID` environment variable.

### Known Issues

It is expected to see some provisioning errors from `Runner` when starting QueryAPI for the first time. These occur when multiple indexers under the same account attempt to provision the same shared infrastructure. These should self resolve after a few seconds.
