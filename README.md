# QueryApi

With QueryApi you can
* Write your own custom indexer function at https://near.org/dataplatform.near/widget/QueryApi.Dashboard;
* Specify the schema for your own custom hosted database and write to it with your indexer function;
* Retrieve that data through a GraphQL API.

# Table of Contents / Applications
1. [QueryApi Coordinator](./indexer)
An Indexer that tracks changes to the QueryApi registry contract. It triggers the execution of those IndexerFunctions
when they match new blocks by placing messages on an SQS queue. Spawns historical processing threads when needed.
   1.a.  Subfolders provide crates for the different components of the Indexer: indexer_rule_type (shared with registry contract), 
indexer_rules_engine, storage.
2. [Indexer Runner](.indexer-js-queue-handler)
   Retrieves messages from the SQS queue, fetches the matching block and executes the IndexerFunction.
3. [IndexerFunction Editor UI](./frontend)
   Serves the editor UI within the dashboard widget and mediates some communication with the GraphQL DB and block server.
4. [Hasura Authentication Service](./hasura-authentication-service)
   Provides authentication for the Hasura GraphQL server.
5. [IndexerFunction Registry Contract](./registry)
   Stores IndexerFunctions, their schemas and execution parameters like start block height.
6. [Lake Block server](./block-server)
   Serves blocks from the S3 lake for in browser testing of IndexerFunctions.
