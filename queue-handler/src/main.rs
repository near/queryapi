use aws_lambda_events::event::sqs::{SqsEvent, SqsMessage};
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use shared::{
    types::primitives::AlertQueueMessage, BorshDeserialize, BorshSerialize, QueueClient, Region,
};

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
    // #[error("Request Error")]
    // RequestError(#[from] minreq::Error),
    #[error("SQLx Error")]
    SqlxError(#[from] sqlx::Error),
    #[error("SQS Error")]
    SQSSendMessageError(String),
}

#[derive(sqlx::FromRow, Debug)]
struct Destination {
    destination_id: i32,
    destination_kind: DestinationKind,
}

#[derive(sqlx::Type, Debug)]
#[sqlx(type_name = "destination_type", rename_all = "SCREAMING_SNAKE_CASE")]
enum DestinationKind {
    Webhook,
    Telegram,
}

#[derive(sqlx::FromRow, Debug)]
struct WebhookDestinationConfig {
    id: i32,
    url: String,
    secret: String,
}

#[derive(sqlx::FromRow, Debug)]
struct TelegramDestinationConfig {
    id: i32,
    chat_id: Option<f64>,
}

impl From<WebhookDestinationConfig> for shared::types::primitives::DestinationConfig {
    fn from(webhook_destination_config: WebhookDestinationConfig) -> Self {
        Self::Webhook {
            destination_id: webhook_destination_config.id,
            url: webhook_destination_config.url,
            secret: webhook_destination_config.secret,
        }
    }
}

impl From<TelegramDestinationConfig> for shared::types::primitives::DestinationConfig {
    fn from(telegram_destination_config: TelegramDestinationConfig) -> Self {
        Self::Telegram {
            destination_id: telegram_destination_config.id,
            chat_id: telegram_destination_config.chat_id.unwrap(),
        }
    }
}

/// This is the main body for the function.
/// Write your code inside it.
/// There are some code example in the following URLs:
/// - https://github.com/awslabs/aws-lambda-rust-runtime/tree/main/lambda-runtime/examples
/// - https://github.com/aws-samples/serverless-rust-demo/
async fn function_handler(event: LambdaEvent<SqsEvent>) -> Result<Vec<Vec<()>>, QueueError> {
    let pool = connect(
        &std::env::var("DATABASE_URL")
            .expect("A DATABASE_URL must be set in this app's Lambda environment variables."),
    )
    .await?;

    let shared_config = aws_config::from_env()
        .region(Region::new("eu-central-1"))
        .load()
        .await;

    let client = QueueClient::new(&shared_config);

    let handle_message_futures = event
        .payload
        .records
        .into_iter()
        .map(|sqs_message| handle_message(sqs_message, &pool, &client));

    futures::future::try_join_all(handle_message_futures).await
}

async fn handle_message(
    message: SqsMessage,
    pool: &sqlx::PgPool,
    client: &QueueClient,
) -> Result<Vec<()>, QueueError> {
    if let Some(endoded_message) = message.body {
        let decoded_message = shared::base64::decode(endoded_message)?;
        let alert_message = AlertQueueMessage::try_from_slice(&decoded_message)?;

        // Disable unless stress-tested and ensured this is a bottleneck
        // TODO: decide how to handle this as it is a bad idea to store it in the same DB
        // let triggered_alert_id: i32 = loop {
        //     match sqlx::query!(
        //         "INSERT INTO triggered_alerts (alert_id, triggered_in_block_hash, triggered_in_transaction_hash, triggered_in_receipt_id, triggered_at) VALUES ($1, $2, $3, $4, now()) RETURNING id",
        //         alert_message.alert_rule_id,
        //         alert_message.payload.block_hash(),
        //         alert_message.payload.transaction_hash(),
        //         alert_message.payload.receipt_id(),
        //     )
        //     .fetch_one(pool)
        //     .await {
        //         Ok(res) => break res.id,
        //         Err(_) => {},
        //     }
        // };

        let destinations: Vec<Destination> = sqlx::query_as!(Destination,
            r#"
SELECT destinations.id as destination_id, destinations.type as "destination_kind: _" FROM enabled_destinations
JOIN destinations ON enabled_destinations.destination_id = destinations.id
WHERE destinations.active = true
    AND enabled_destinations.alert_id = $1
            "#,
            alert_message.alert_rule_id
        )
        .fetch_all(pool)
        .await?;

        let handle_destination_futures = destinations.into_iter().map(|destination| {
            handle_destination(
                alert_message.clone(),
                destination,
                // triggered_alert_id,
                client,
                pool,
            )
        });

        return Ok(futures::future::try_join_all(handle_destination_futures).await?);
    }
    Err(QueueError::HandleMessage(
        "SQS message is empty".to_string(),
    ))
}

async fn handle_destination(
    alert_message: AlertQueueMessage,
    destination: Destination,
    // triggered_alert_id: i32,
    client: &QueueClient,
    pool: &sqlx::PgPool,
) -> Result<(), QueueError> {
    let queue_url: String;
    let destination_config: shared::types::primitives::DestinationConfig =
        match &destination.destination_kind {
            DestinationKind::Webhook => {
                queue_url = std::env::var("WEBHOOK_QUEUE_URL")
                    .expect("WEBHOOK_QUEUE_URL is not provided for the lambda");
                sqlx::query_as!(
                    WebhookDestinationConfig,
                    r#"
SELECT destination_id as id, url, secret FROM webhook_destinations WHERE destination_id = $1
                "#,
                    destination.destination_id
                )
                .fetch_one(pool)
                .await?
                .into()
            }
            DestinationKind::Telegram => {
                queue_url = std::env::var("TELEGRAM_QUEUE_URL")
                    .expect("TELEGRAM_QUEUE_URL is not provided for the lambda");
                sqlx::query_as!(
                    TelegramDestinationConfig,
                    r#"
SELECT destination_id as id, chat_id FROM telegram_destinations WHERE destination_id = $1
                "#,
                    destination.destination_id
                )
                .fetch_one(pool)
                .await?
                .into()
            }
        };

    let alert_delivery_task = shared::types::primitives::AlertDeliveryTask {
        // triggered_alert_id,
        destination_config,
        alert_message,
    };

    match client
        .send_message()
        .queue_url(queue_url)
        .message_body(shared::base64::encode(alert_delivery_task.try_to_vec()?))
        .send()
        .await
    {
        Ok(rsp) => eprintln!("Response from sending a message: {:#?}", rsp),
        Err(err) => eprintln!("Error {:#?}", err),
    };

    Ok(())
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
