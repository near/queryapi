use aws_lambda_events::event::sqs::{SqsEvent, SqsMessage};
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use shared::{types::primitives::AlertDeliveryTask, BorshDeserialize};
use teloxide::{
    payloads::SendMessageSetters,
    requests::{Request, Requester},
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
    #[error("SQLx Error")]
    SqlxError(#[from] sqlx::Error),
}

/// This is the main body for the function.
/// Write your code inside it.
/// There are some code example in the following URLs:
/// - https://github.com/awslabs/aws-lambda-rust-runtime/tree/main/lambda-runtime/examples
/// - https://github.com/aws-samples/serverless-rust-demo/
async fn function_handler(event: LambdaEvent<SqsEvent>) -> Result<Vec<()>, QueueError> {
    // let pool = connect(
    //     &std::env::var("DATABASE_URL")
    //         .expect("A DATABASE_URL must be set in this app's Lambda environment variables."),
    // )
    // .await?;

    let token = std::env::var("TELEGRAM_TOKEN").expect("TELEGRAM_TOKEN must be set for the lambda");

    let bot = teloxide::Bot::new(token);

    let handle_message_futures = event.payload.records.into_iter().map(|sqs_message| {
        handle_message(
            sqs_message,
            // &pool,
            &bot,
        )
    });

    futures::future::try_join_all(handle_message_futures).await
}

async fn handle_message(
    message: SqsMessage,
    // pool: &sqlx::PgPool,
    bot: &teloxide::Bot,
) -> Result<(), QueueError> {
    if let Some(endoded_message) = message.body {
        let decoded_message = shared::base64::decode(endoded_message)?;
        let delivery_task = AlertDeliveryTask::try_from_slice(&decoded_message)?;

        let explorer_link = delivery_task.alert_message.explorer_link();

        //         let alert_rule = sqlx::query_as!(
        //             AlertRule,
        //             r#"
        // SELECT name FROM alert_rules WHERE id = $1
        //             "#,
        //             delivery_task.alert_message.alert_rule_id,
        //         )
        //         .fetch_one(pool)
        //         .await?;

        if let shared::types::primitives::DestinationConfig::Telegram {
            chat_id,
            destination_id: _,
        } = delivery_task.destination_config
        {
            let (_status, _response) = match bot
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
                Err(err) => (-1i32, format!("{}", err)),
            };

            // Disabling unless stress-tested to check if INSERTs are bottlenecks
            // TODO: Refactor/move the logic somewhere
            // sqlx::query!(
            //     "INSERT INTO triggered_alerts_destinations (triggered_alert_id, alert_id, destination_id, status, response, created_at) VALUES ($1, $2, $3, $4, $5, now())",
            //     delivery_task.triggered_alert_id,
            //     delivery_task.alert_message.alert_rule_id,
            //     destination_id,
            //     status,
            //     response,
            // )
            //     .execute(pool)
            //     .await?;

            return Ok(());
        }
    }
    Err(QueueError::HandleMessage(
        "SQS message is empty".to_string(),
    ))
}

// async fn connect(connection_str: &str) -> Result<sqlx::PgPool, sqlx::Error> {
//     sqlx::postgres::PgPoolOptions::new()
//         .max_connections(5)
//         .connect(connection_str)
//         .await
// }

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        // disabling time is handy because CloudWatch will add the ingestion time.
        .without_time()
        .init();

    run(service_fn(function_handler)).await
}
