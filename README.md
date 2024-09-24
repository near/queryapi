# QueryApi

With QueryApi you can
* Write your own custom indexer function at https://near.org/dataplatform.near/widget/QueryApi.Dashboard;
* Specify the schema for your own custom hosted database and write to it with your indexer function;
* Retrieve that data through a GraphQL API.

## 🧩 Components
1. [Coordinator](./coordinator)
   Continuously reads latest registry and attempts to synchronise that configuration across the system, i.e. starting relevant Block Streams and Executors.
1. [Runner](./runner)
   Manages "Executors" which, retrieves messages from Redis Streams, fetches matching blocks, and executes Indexer code against that block. 
   Retrieves messages from Redis Stream, fetching matching block and executes the IndexerFunction.
1. [Block Streamer](./block-streamer)
   Manages "Block Streams" which, use the configured contract filter to fetch relevant blocks from S3 and publish those blocks to Redis Streams.
1. [IndexerFunction Editor UI](./frontend)
   Serves the editor UI within the dashboard widget and mediates some communication with the GraphQL DB and block server.
1. [Hasura Authentication Service](./hasura-authentication-service)
   Provides authentication for the Hasura GraphQL server.
1. [IndexerFunction Registry Contract](./registry)
   Stores IndexerFunctions, their schemas and execution parameters like start block height.
1. [Lake Block server](./block-server)
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

Block Streamer:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

These should be populated with your credentials. In most cases, the same key pair can be used for all 3 sets of credentials. Just ensure the keys have permissions to access S3 for handling [Requestor Pays](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RequesterPaysBuckets.html) in Near Lake. 

### Running QueryApi
With everything configured correctly, we can now start all components of QueryApi with:
```sh
docker compose up
```

### Developing frontend
1. Change `frontend/replacement.dev.json` to
```json
{
    "REPL_ACCOUNT_ID": "dev-queryapi.dataplatform.near",
    "REPL_GRAPHQL_ENDPOINT": "https://near-queryapi.dev.api.pagoda.co",
    "REPL_EXTERNAL_APP_URL": "http://localhost:3000",
    "REPL_REGISTRY_CONTRACT_ID": "dev-queryapi.dataplatform.near",
    "REPL_QUERY_API_USAGE_URL": "https://storage.googleapis.com/databricks-near-query-runner/output/query-api-usage/indexers_dev.json"
}
```
2. `cd frontend`
3. `npm install`
4. `npm run dev`
5. `npm run serve:widgets:dev`
6. Set flags https://dev.near.org/flags to `http://127.0.0.1:3030`
7. Navigate to `https://dev.near.org/dev-queryapi.dataplatform.near/widget/QueryApi.dev-App`

### Local Configuration
- Coordinator watches the dev registry contract by default (`dev-queryapi.dataplatform.near`). To use a different contract, you can update the `REGISTRY_CONTRACT_ID` environment variable.

### Known Issues

It is expected to see some provisioning errors from `Runner` when starting QueryAPI for the first time. These occur when multiple indexers under the same account attempt to provision the same shared infrastructure. These should self resolve after a few seconds.
