# Alertexer (indexer) Concept

[Alertexer is a dedicated indexer](../alertexer) that follows the tip of the network and checks the Blockchain Data against user-created [`AlertRules`](../alert-rules). In case of match it crafts an instance of `AlertQueueMessage` and sends it to the [main queue](../queue-handler).


In the beginning of this project we were thinking about having different code-bases of alertexers to follow different types of `AlertRules`. However, during the implementation we didn't like the idea of having copy-pasted indexers that we need to maintain. So we've combined all of them into one (though it's a subject to change if we see it doesn't work in the future).

We split the code that matches and handles the `AlertRules` into modules. We name this modules as `reducers` because it's basically what they do. They reduce the Blockchain Data received and narrow it to only the pieces that match `AlertRules`.


## Modules

The main task module solves is to build an `AlertQueueMessage` to be sent to [the main queue](../queue-handler). This logic can be placed to the module's root `mod.rs`.

The code to match the pieces against an `AlertRule` should be placed to module's `matchers.rs`

### `outcomes_reducer`

This module performs checks against `ExecutionOutcomes`. It can match all the actions in `ReceiptEnumView::Action`, and also can match `ExecutionOutcome.logs` for [Events Standard](https://nomicon.io/Standards/EventsFormat).


### `state_changes_reducer`

This module performs checks against `StateChangeWithCauseView`. It can match all account balance changes in `StateChangeWithCauseView`.


## Requirements

Every instance of `alertexer` requires an instance of Redis (separate for each indexer). We cache there a relation between a `receipt_id` and its parent Transaction, keep track of what was the last block height we've indexed with this particular instance of alertexer, and cache account balances.

These parameters are required in order to run `alertexer` instance. You can provide them via `.env` file

```
DATABASE_URL=postgresql://user:pass@hosy/db
LAKE_AWS_ACCESS_KEY=AK_TO_ACCESS_S3_LAKE
LAKE_AWS_SECRET_ACCESS_KEY=AWS_SECRET_TO_ACCESS_S3_LAKE
QUEUE_AWS_ACCESS_KEY=AK_TO_ACCESS_SQS
QUEUE_AWS_SECRET_ACCESS_KEY=AWS_SECRET_TO_ACCESS_SQS
QUEUE_URL=https_url_to_main_sqs_queue
```

**DATABASE_URL** to the database where `AlertRules` are stored. Required to constantly sync rules to run checks against.
**LAKE_AWS_ACCESS_KEY** & **LAKE_AWS_SECRET_ACCESS_KEY** The AWS credentials that can read from NEAR Lake S3 Buckets.
**QUEUE_AWS_ACCESS_KEY** & **QUEUE_AWS_SECRET_ACCESS_KEY** The AWS credentials that can send messages to the queue[1]
**QUEUE_URL** the URL to the main queue[1]

All these parameters can be also provided through the CLI keys, see Usage section of this doc.

## Usage

For the sake we've introduced a `docker-compose.yml` that allows you to build and run the `alertexer` along with Redis.

### Command reference

```bash
alertexer [OPTIONS] \
    --database-url <DATABASE_URL> \
    --lake-aws-access-key <LAKE_AWS_ACCESS_KEY> \
    --lake-aws-secret-access-key <LAKE_AWS_SECRET_ACCESS_KEY> \
    --queue-aws-access-key <QUEUE_AWS_ACCESS_KEY> \
    --queue-aws-secret-access-key <QUEUE_AWS_SECRET_ACCESS_KEY> \
    --queue-url <QUEUE_URL> \
    <SUBCOMMAND>

OPTIONS:
        --database-url <DATABASE_URL>
            Connection string to connect to the PostgreSQL Database to fetch AlertRules from

    -h, --help
            Print help information

        --lake-aws-access-key <LAKE_AWS_ACCESS_KEY>
            AWS Access Key with the rights to read from AWS S3

        --lake-aws-secret-access-key <LAKE_AWS_SECRET_ACCESS_KEY>
            AWS Secret Access Key with the rights to read from AWS S3

        --queue-aws-access-key <QUEUE_AWS_ACCESS_KEY>
            AWS Access Key with the rights to send messages to the `--queue-url`

        --queue-aws-secret-access-key <QUEUE_AWS_SECRET_ACCESS_KEY>
            AWS Secret Access Key with the rights to send messages to the `--queue-url`

        --queue-url <QUEUE_URL>
            URL to the main AWS SQS queue backed by Queue Handler lambda

        --redis-connection-string <REDIS_CONNECTION_STRING>
            Connection string to connect to the Redis instance for cache. Default: "redis://127.0.0.1"

    -V, --version
            Print version information

SUBCOMMANDS:
    mainnet

    testnet
```

