use crate::indexer_types::IndexerQueueMessage;
use aws_credential_types::provider::SharedCredentialsProvider;
pub use aws_sdk_sqs::{
    error::SendMessageError, model::SendMessageBatchRequestEntry, Client as QueueClient, Region,
};

pub const MOCK_QUEUE_URL: &str = "MOCK";

/// Creates AWS SQS Client for QueryApi SQS
pub fn queue_client(region: String, credentials: SharedCredentialsProvider) -> aws_sdk_sqs::Client {
    let shared_config = queue_aws_sdk_config(region, credentials);
    aws_sdk_sqs::Client::new(&shared_config)
}

/// Creates AWS Shared Config for QueryApi SQS queue
pub fn queue_aws_sdk_config(
    region: String,
    credentials: SharedCredentialsProvider,
) -> aws_types::sdk_config::SdkConfig {
    aws_types::sdk_config::SdkConfig::builder()
        .credentials_provider(credentials)
        .region(aws_types::region::Region::new(region))
        .build()
}

pub async fn send_to_indexer_queue(
    client: &aws_sdk_sqs::Client,
    queue_url: String,
    indexer_queue_messages: Vec<IndexerQueueMessage>,
) -> anyhow::Result<()> {
    if queue_url == MOCK_QUEUE_URL {
        for m in &indexer_queue_messages {
            tracing::info!(
                "Mock sending messages to SQS: {:?} {:?}",
                m.indexer_function.function_name,
                m.block_height
            );
        }
        return Ok(());
    }

    let message_bodies: Vec<SendMessageBatchRequestEntry> = indexer_queue_messages
        .into_iter()
        .enumerate()
        .map(|(index, indexer_queue_message)| {
            SendMessageBatchRequestEntry::builder()
                .id(index.to_string())
                .message_body(
                    serde_json::to_string(&indexer_queue_message)
                        .expect("Failed to Json Serialize IndexerQueueMessage"),
                )
                .message_group_id(format!(
                    "{}_{}",
                    indexer_queue_message.indexer_function.account_id,
                    indexer_queue_message.indexer_function.function_name
                ))
                .build()
        })
        .collect();

    let rsp = client
        .send_message_batch()
        .queue_url(queue_url)
        .set_entries(Some(message_bodies))
        .send()
        .await?;
    tracing::debug!(
        target: crate::INDEXER,
        "Response from sending a message to SQS\n{:#?}",
        rsp
    );
    Ok(())
}
