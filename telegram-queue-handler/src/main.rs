use alertexer_types::primitives::AlertDeliveryTask;
use aws_lambda_events::event::sqs::{SqsEvent, SqsMessage};
use borsh::BorshDeserialize;
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use teloxide::{
    payloads::SendMessageSetters,
    requests::{Request, Requester},
};

static POOL: tokio::sync::OnceCell<sqlx::PgPool> = tokio::sync::OnceCell::const_new();

#[derive(thiserror::Error, Debug)]
pub enum QueueError {
    #[error("lambda_runtime error")]
    LambdaError(#[from] Error),
    #[error("Handle message error")]
    HandleMessage(String),
    #[error("Decode error")]
    DecodeError(#[from] base64::DecodeError),
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
            match connect(
                &std::env::var("DATABASE_URL").expect(
                    "A DATABASE_URL must be set in this app's Lambda environment variables.",
                ),
            )
            .await
            {
                Ok(res) => res,
                Err(err) => {
                    tracing::error!("Failed to establish DB connection:\n{:?}", err);
                    panic!("{:?}", err);
                }
            }
        })
        .await;

    let token = std::env::var("TELEGRAM_TOKEN").expect("TELEGRAM_TOKEN must be set for the lambda");

    let bot = teloxide::Bot::new(token);

    let handle_message_futures = event
        .payload
        .records
        .into_iter()
        .map(|sqs_message| handle_message(sqs_message, &pool, &bot));

    futures::future::try_join_all(handle_message_futures).await
}

async fn handle_message(
    message: SqsMessage,
    pool: &sqlx::PgPool,
    bot: &teloxide::Bot,
) -> Result<(), QueueError> {
    if let Some(endoded_message) = message.body {
        let decoded_message = match base64::decode(endoded_message) {
            Ok(res) => res,
            Err(err) => {
                tracing::error!(
                    "Error during decoding the base64 body of the AlertQueueMessage\n{:?}",
                    err
                );
                panic!("{:?}", err);
            }
        };

        let delivery_task = match AlertDeliveryTask::try_from_slice(&decoded_message) {
            Ok(res) => {
                tracing::info!("{:?}", res);
                res
            }
            Err(err) => {
                tracing::error!("Failed to BorshDeserialize AlertDeliveryTask:\n{:?}", err);
                panic!("{:?}", err);
            }
        };

        let explorer_link = delivery_task.alert_message.explorer_link();

        if let alertexer_types::primitives::DestinationConfig::Telegram {
            chat_id,
            destination_id,
        } = delivery_task.destination_config
        {
            let (status, response) = match bot
                .send_message(
                    chat_id.to_string(),
                    format!(
                        "Alert \"{}\" triggered. See <a href=\"{}\">NEAR Explorer</a> for details",
                        delivery_task.alert_message.alert_name, explorer_link
                    ),
                )
                .parse_mode(teloxide::types::ParseMode::Html)
                .send()
                .await
            {
                Ok(_) => (200i32, format!("")),
                Err(err) => {
                    tracing::error!("[Skip] Telegram send error:\n{:?}", err);
                    (-1i32, format!("{}", err))
                }
            };

            // Disabling unless stress-tested to check if INSERTs are bottlenecks
            // TODO: Refactor/move the logic somewhere
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
            if _res.is_err() {
                tracing::error!(
                    "[Skip] Error on inserting triggered_alerts_destination info to the DB:\n{:?}",
                    _res
                );
            }

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
