# QueryApi MVP 

An indexer toolset based off of Alertexer to power custom Index Functions.

### To deploy the alertexer module to GCP
Push the docker image to the GCP container registry.
`gcloud auth configure-docker us-central1-docker.pkg.dev`
`docker build -t --push us-central1-docker.pkg.dev/pagoda-shared-infrastructure/data-platform/queryapi-alertexer:latest .`


Originally forked from Alertexer, see https://github.com/near/alertexer/blob/main/README.md
and https://github.com/near/alertexer/tree/main/docs

Below is README.md content duplicated from Alertexer that is relevant to running the alertexer module.


## Structure

This project is using `workspace` feature of Cargo.

### Crates

- [`alert-rules`](./alert-rules) crate provides the `AlertRule` type for usage in other crates
- [`shared`](./shared) crate holds the common `clap` structs for every indexer in the workspace. Also, it includes shared types and utils.
- [`storage`](./storage) crate provides the functions to work with Redis that are common for all indexers in the workspace

### Indexers

- [`alertexer`](./alertexer) an indexer to watch for `AlertRules`

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
