# Writing a `*-queue-handler`

`*-queue-handlers` are AWS Lambda functions.

**We prefer Rust** despite the fact lambda can be written in many different languages.

### Useful references

- https://aws.amazon.com/blogs/opensource/rust-runtime-for-aws-lambda/
- https://docs.aws.amazon.com/sdk-for-rust/latest/dg/lambda.html
- https://github.com/cargo-lambda/cargo-lambda

## Creating a queue-handler lambda

### General

Creating a lambda from scratch is starting from running the `cargo lambda new` command. However, we strongly recommend to start your work on top of one of the lambda code we've already made:

- [`telegram-queue-handler`](../telegram-queue-handler)
- [`webhook-queue-handler`](../webhook-queue-handler)

Below we provide step-by-step guide to get a nice template to start from:

### `Cargo.toml`

```toml
[package]
name = "YOUR-queue-handler"
version = "0.1.0"
edition = "2021"


# Use cargo-edit(https://github.com/killercup/cargo-edit#installation)
# to manage dependencies.
# Running `cargo add DEPENDENCY_NAME` will
# add the latest version of a dependency to the list,
# and it will keep the alphabetic ordering for you.
[workspace]

[dependencies]
aws_lambda_events = { version = "0.6.1", default-features = false, features = ["sqs"] }
futures = "0.3.5"
lambda_runtime = "0.5.1"
openssl = { version = "0.10", features = ["vendored"] }
serde_json = "1.0.55"
sqlx = { version = "0.5", features = [ "runtime-tokio-native-tls", "postgres", "macros", "offline" ] }
thiserror = "1.0.31"
tokio = { version = "1", features = ["macros"] }
tracing = { version = "0.1", features = ["log"] }
tracing-subscriber = { version = "0.3", default-features = false, features = ["fmt"] }

shared = { path = "../shared" }

```

### `main.rs`

```rust
use aws_lambda_events::event::sqs::{SqsEvent, SqsMessage};
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use shared::{types::primitives::AlertDeliveryTask, BorshDeserialize};

static POOL: tokio::sync::OnceCell<sqlx::PgPool> = tokio::sync::OnceCell::const_new();

#[derive(thiserror::Error, Debug)]
pub enum QueueError {
    #[error("lambda_runtime error")]
    LambdaError(#[from] Error),
    #[error("Handle message error")]
    HandleMessage(String),
    #[error("Decode error")]
    DecodeError(#[from] shared::base64::DecodeError),
    #[error("IO Error")]
    IOError(#[from] std::io::Error),
    #[error("Serialization error")]
    SerializationError(#[from] serde_json::Error),
    #[error("SQLx Error")]
    SqlxError(#[from] sqlx::Error),
}

/// This is the main body for the function.
/// Write your code inside it.
/// There are some code example in the following URLs:
/// - https://github.com/awslabs/aws-lambda-rust-runtime/tree/main/lambda-runtime/examples
/// - https://github.com/aws-samples/serverless-rust-demo/
async fn function_handler(event: LambdaEvent<SqsEvent>) -> Result<Vec<()>, QueueError> {
    let pool = POOL
        .get_or_init(|| async {
            connect(
                &std::env::var("DATABASE_URL").expect(
                    "A DATABASE_URL must be set in this app's Lambda environment variables.",
                ),
            )
            .await
            .unwrap()
        })
        .await;

    let handle_message_futures = event
        .payload
        .records
        .into_iter()
        .map(|sqs_message| handle_message(sqs_message, &pool));

    futures::future::try_join_all(handle_message_futures).await
}

async fn handle_message(
    message: SqsMessage,
    pool: &sqlx::PgPool,
) -> Result<(), QueueError> {
    if let Some(endoded_message) = message.body {
        let decoded_message = shared::base64::decode(endoded_message)?;
        let delivery_task = AlertDeliveryTask::try_from_slice(&decoded_message)?;

        let explorer_link = delivery_task.alert_message.explorer_link();

        if let shared::types::primitives::DestinationConfig::DESTINATION {
            destination_id,
            ..
        } = delivery_task.destination_config
        {
            let (response, status) = // WRITE YOUR LOGIC, CAPTURE THE RESEULT

            // WRITE THE RESPONSE TO THE DB
            let _res = sqlx::query!(
                "INSERT INTO triggered_alerts_destinations (triggered_alert_id, alert_id, destination_id, status, response, created_at) VALUES ($1, $2, $3, $4, $5, now())",
                delivery_task.triggered_alert_id,
                delivery_task.alert_message.alert_rule_id,
                destination_id,
                status,
                response,
            )
                .execute(pool)
                .await;

            return Ok(());
        }
    }
    Err(QueueError::HandleMessage(
        "SQS message is empty".to_string(),
    ))
}

async fn connect(connection_str: &str) -> Result<sqlx::PgPool, sqlx::Error> {
    sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(connection_str)
        .await
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        // disabling time is handy because CloudWatch will add the ingestion time.
        .without_time()
        .init();

    run(service_fn(function_handler)).await
}

```

## Checking

### `test_payload.json`

This JSON-file can be used to emulate the lambda logic locally. Replace `___BASE_64_ENCODED_ALERT_QUEUE_MESSAGE___` with the relevant `AlertQueueMessage` properly serialized and encoded to test things out.

```json
{
    "Records": [
        {
            "messageId": "059f36b4-87a3-44ab-83d2-661975830a7d",
            "receiptHandle": "AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...",
            "body": "___BASE_64_ENCODED_ALERT_QUEUE_MESSAGE___",
            "attributes": {
                "ApproximateReceiveCount": "1",
                "SentTimestamp": "1545082649183",
                "SenderId": "AIDAIENQZJOLO23YVJ4VO",
                "ApproximateFirstReceiveTimestamp": "1545082649185"
            },
            "messageAttributes": {},
            "md5OfBody": "098f6bcd4621d373cade4e832627b4f6",
            "eventSource": "aws:sqs",
            "eventSourceARN": "arn:aws:sqs:us-east-2:123456789012:my-queue",
            "awsRegion": "us-east-2"
        },
        {
            "messageId": "059f36b4-87a3-44ab-83d2-661975830a7d",
            "receiptHandle": "AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...",
            "body": "___BASE_64_ENCODED_ALERT_QUEUE_MESSAGE___",
            "attributes": {
                "ApproximateReceiveCount": "1",
                "SentTimestamp": "1545082649183",
                "SenderId": "AIDAIENQZJOLO23YVJ4VO",
                "ApproximateFirstReceiveTimestamp": "1545082649185"
            },
            "messageAttributes": {},
            "md5OfBody": "098f6bcd4621d373cade4e832627b4f6",
            "eventSource": "aws:sqs",
            "eventSourceARN": "arn:aws:sqs:us-east-2:123456789012:my-queue",
            "awsRegion": "us-east-2"
        }
    ]
}

```

### Run locally

This will start local "emulator" of the AWS lambda with our lambda deployed

```
$ cargo lambda watch
```

This will invoke the function with predefined test payload

```
$ cargo lambda invoke --data-file test_payload.json
```

## Deploying

the role: `arn:aws:iam::754641474505:role/lambda-alertexer`

```
$ cargo lambda build --release
$ cargo lambda deploy --iam-role arn:aws:iam::754641474505:role/lambda-alertexer
```
