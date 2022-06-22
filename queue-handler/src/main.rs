use aws_lambda_events::event::sqs::{SqsEvent, SqsMessage};use lambda_runtime::{run, service_fn, Error, LambdaEvent};use shared::{BorshDeserialize, types::primitives::{AlertQueueMessage, ActionsAlertPayload}};

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
    #[error("Requeest Error")]
    RequestError(#[from] minreq::Error),
}

/// This is the main body for the function.
/// Write your code inside it.
/// There are some code example in the following URLs:
/// - https://github.com/awslabs/aws-lambda-rust-runtime/tree/main/lambda-runtime/examples
/// - https://github.com/aws-samples/serverless-rust-demo/
async fn function_handler(event: LambdaEvent<SqsEvent>) -> Result<Vec<()>, QueueError> {
    let handle_message_futures = event
        .payload
        .records
        .into_iter()
        .map(|sqs_message| handle_message(sqs_message));

    futures::future::try_join_all(handle_message_futures).await
}

async fn handle_message(message: SqsMessage) -> Result<(), QueueError> {
    if let Some(endoded_message) = message.body {
        let decoded_message = base64::decode(endoded_message)?;
        let alert_message = AlertQueueMessage::<ActionsAlertPayload>::try_from_slice(&decoded_message)?;

        minreq::post("https://webhook.site/9adaff74-af10-4c4f-920b-175d65e5950c")
            .with_json(&alert_message)?
            .send()?;
        // let client = reqwest::Client::new();
        // let _ = client.post("https://webhook.site/9adaff74-af10-4c4f-920b-175d65e5950c")
        //     .json(&serde_json::to_value(alert_message)?)
        //     .send()
        //     .await?;

        return Ok(());
    }
    Err(QueueError::HandleMessage("SQS message is empty".to_string()))
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
