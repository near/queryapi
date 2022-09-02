use alertexer_types::primitives::AlertDeliveryTask;
use aws_lambda_events::event::sqs::{SqsEvent, SqsMessage};
use borsh::BorshDeserialize;
use lambda_runtime::{run, service_fn, Error, LambdaEvent};

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
    #[error("Request Error")]
    RequestError(#[from] minreq::Error),
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

    let handle_message_futures = event
        .payload
        .records
        .into_iter()
        .map(|sqs_message| handle_message(sqs_message, &pool));

    futures::future::try_join_all(handle_message_futures).await
}

async fn handle_message(message: SqsMessage, pool: &sqlx::PgPool) -> Result<(), QueueError> {
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

        if let alertexer_types::primitives::DestinationConfig::Webhook {
            url,
            secret,
            destination_id,
        } = delivery_task.destination_config
        {
            let (status, response) = match minreq::post(&url)
                .with_header("Authorization", format!("Bearer {}", secret))
                .with_json(&delivery_task.alert_message)?
                .send()
            {
                Ok(rsp) => {
                    tracing::info!("WebHook response:\n{:?}", rsp);
                    (rsp.status_code, rsp.as_str()?.to_string())
                }
                Err(err) => {
                    tracing::error!("[Skip] Error received from the Webhook:\n{:?}", err);

                    (-1i32, format!("{}", err))
                }
            };

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
