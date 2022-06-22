# Alertexer

A set of indexers to empower the Alerts Feature in DevConsole

## Structure

This project is using `workspace` feature of Cargo.

### Crates

- `alert-rules` crate provides the `AlertRule` type for usage in other crates
- `shared` crate holds the common `clap` structs for every indexer in the workspace. Also, it includes shared types and utils.
- `storage` crate provides the functions to work with Redis that are common for all indexers in the workspace

### Indexers

Naming convention is to add `-alertexer` for indexers in this project.

- `actions-alertexer` an indexer to watch for ACTIONS
- *deprecated* `tx-alertexer` (excluded from the workspace) an indexer that watches for entire transaction and collects all the stuff related to the transaction.

### External-ish stuff

Closely related to the project but excluded from the workspace for different reasons crates.

- *draft* `queue-handler` is an AWS lambda function (Rust-lang) that listens to the events in main AWS SQS queue for alertexer. Interacts with the DevConsole DB to get data about the `AlertRule` and stores info about triggered events, passed the triggered event to the relevant queue based on the delivery channel.

## Design concept

Identified major types of the events on the network:

- `ACTIONS` - following the `ActionReceipts` (party of the transaction, transfer, create account, etc.)
- `EVENTS` - following the [Events Format](https://nomicon.io/Standards/EventsFormat)
- `STATE_CHANGES` *name is a subject to change* - following the `StateChanges` (account state change, stake rewards, account balances changes, etc.)

We decided to build separate indexers for these major types.

## `.env`

```
DATABASE_URL=postgres://user:pass@host/database
LAKE_AWS_ACCESS_KEY=AKI_LAKE_ACCESS...
LAKE_AWS_SECRET_ACCESS_KEY=LAKE_SECRET...
QUEUE_AWS_ACCESS_KEY=AKI_SQS_ACCESS...
QUEUE_AWS_SECRET_ACCESS_KEY=SQS_ACCESS_SECRET
QUEUE_URL=https://sqs.eu-central-1.amazonaws.com/754641474505/alertexer-queue

```
