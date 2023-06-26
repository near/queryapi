# QueryApi MVP 

An indexer toolset based off of Alertexer to power custom Index Functions.

### To deploy the queryapi_coordinator module to GCP
See [queryapi_coordinator/README.md](./queryapi_coordinator/README.md)

Originally forked from Alertexer, see https://github.com/near/alertexer/blob/main/README.md
and https://github.com/near/alertexer/tree/main/docs

Below is README.md content duplicated from Alertexer that is relevant to running the queryapi_coordinator module.


## Structure

This project is using `workspace` feature of Cargo.

### Crates

- [`indexer_rule_type`](./indexer_rule_type) provides the IndexerRule type to this app and the registry contract.
- [`indexer_rules_engine`](./indexer_rules_engine) contains logic for matching IndexerRules against StreamerMessages
- [`storage`](./storage) crate provides the functions to work with Redis

### Indexers

- [`queryapi_coordinator`](./queryapi_coordinator) an indexer to index changes to the QueryApi registry contract and
  to watch for `IndexerRules` associated with the IndexerFunctions in the registry.

### Tests
Some tests require blocks with matching data. To download the test block, run 
`./download_test_blocks.sh 93085141`. Some other useful blocks are 80854399 92476362 93085141 93659695.

## Design concept

Identified major types of the events on the network:

- `ACTIONS` - following the `ActionReceipts` (party of the transaction, transfer, create account, etc.)
- `EVENTS` - following the [Events Format](https://nomicon.io/Standards/EventsFormat)
- `STATE_CHANGES` *name is a subject to change* - following the `StateChanges` (account state change, stake rewards, account balances changes, etc.)

## `.env`

```
DATABASE_URL=postgres://user:pass@host/database
LAKE_AWS_ACCESS_KEY=AKI_LAKE_ACCESS...
LAKE_AWS_SECRET_ACCESS_KEY=LAKE_SECRET...
QUEUE_AWS_ACCESS_KEY=AKI_SQS_ACCESS...
QUEUE_AWS_SECRET_ACCESS_KEY=SQS_ACCESS_SECRET
QUEUE_URL=https://sqs.eu-central-1.amazonaws.com/754641474505/alertexer-queue

```
## Running locally
 * _Install postgres locally if not already present._
 * Create a local postgres database and user like so, changing the credentials to your liking:
```
psql 
CREATE DATABASE alerts;
CREATE USER alerts WITH PASSWORD 'alerts';
GRANT ALL PRIVILEGES ON DATABASE alerts TO alerts;
```
 * Update the `.env` file with the database credentials you just set. `host.docker.internal` as the hostname will point to your local host machine. 
 * Run [schema.sql](./alert-rules/schema.sql) against your alerts DB to create the alert rules tables.
 * Grant table privileges to the DB user
```
psql
GRANT USAGE ON SCHEMA public TO alerts;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO alerts;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO alerts;
```
 * _Install docker locally if not already present._
 * Run `docker compose up`
