use futures::future::try_join_all;

use alert_rules::AlertRule;

use near_lake_framework::near_indexer_primitives::{
    views::ExecutionStatusView, IndexerExecutionOutcomeWithReceipt, IndexerTransactionWithOutcome,
};

use crate::matchers::Matcher;

pub(crate) async fn receipts(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    alert_rules: &[AlertRule],
    redis_connection_manager: &storage::ConnectionManager,
    queue_client: &shared::QueueClient,
    queue_url: &str,
) -> anyhow::Result<()> {
    let cache_tx_receipts_future = streamer_message
        .shards
        .iter()
        .filter_map(|shard| shard.chunk.as_ref())
        .map(|chunk| cache_receipts_from_tx(chunk.transactions.as_ref(), redis_connection_manager));

    try_join_all(cache_tx_receipts_future).await?;

    let receipt_execution_outcomes: Vec<IndexerExecutionOutcomeWithReceipt> = streamer_message
        .shards
        .iter()
        .flat_map(|shard| shard.receipt_execution_outcomes.clone())
        .collect();

    cache_receipts_from_outcomes(&receipt_execution_outcomes, redis_connection_manager).await?;

    let execution_outcomes_rule_handler_future = alert_rules.iter().map(|alert_rule| {
        rule_handler(
            alert_rule,
            &receipt_execution_outcomes,
            redis_connection_manager,
            queue_client,
            queue_url,
        )
    });

    try_join_all(execution_outcomes_rule_handler_future).await?;

    Ok(())
}

async fn cache_receipts_from_tx(
    transactions: &[IndexerTransactionWithOutcome],
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<()> {
    let push_receipt_to_watching_list_future = transactions.iter().map(|tx| async {
        let transaction_hash_string = tx.transaction.hash.to_string();
        let converted_into_receipt_id = tx
            .outcome
            .execution_outcome
            .outcome
            .receipt_ids
            .first()
            .expect("`receipt_ids` must contain one Receipt ID")
            .to_string();

        return storage::push_receipt_to_watching_list(
            redis_connection_manager,
            &converted_into_receipt_id,
            &transaction_hash_string,
        )
        .await;
    });
    try_join_all(push_receipt_to_watching_list_future).await?;

    Ok(())
}

async fn cache_receipts_from_outcomes(
    receipt_execution_outcomes: &[IndexerExecutionOutcomeWithReceipt],
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<()> {
    for receipt_execution_outcome in receipt_execution_outcomes {
        if let Ok(Some(transaction_hash)) = storage::get::<Option<String>>(
            redis_connection_manager,
            &receipt_execution_outcome.receipt.receipt_id.to_string(),
        )
        .await
        {
            // Add the newly produced receipt_ids to the watching list
            for receipt_id in receipt_execution_outcome
                .execution_outcome
                .outcome
                .receipt_ids
                .iter()
            {
                tracing::debug!(target: crate::INDEXER, "+R {}", &receipt_id.to_string(),);
                storage::push_receipt_to_watching_list(
                    redis_connection_manager,
                    &receipt_id.to_string(),
                    &transaction_hash,
                )
                .await?;
            }

            // Add the success receipt to the watching list
            if let ExecutionStatusView::SuccessReceiptId(receipt_id) =
                receipt_execution_outcome.execution_outcome.outcome.status
            {
                tracing::debug!(target: crate::INDEXER, "+R {}", &receipt_id.to_string(),);
                storage::push_receipt_to_watching_list(
                    redis_connection_manager,
                    &receipt_id.to_string(),
                    &transaction_hash,
                )
                .await?;
            }
        }
    }
    Ok(())
}

async fn rule_handler(
    alert_rule: &AlertRule,
    receipt_execution_outcomes: &[IndexerExecutionOutcomeWithReceipt],
    redis_connection_manager: &storage::ConnectionManager,
    queue_client: &shared::QueueClient,
    queue_url: &str,
) -> anyhow::Result<()> {
    for receipt_execution_outcome in receipt_execution_outcomes {
        if alert_rule.matches(receipt_execution_outcome) {
            let receipt_id = receipt_execution_outcome.receipt.receipt_id.to_string();
            if let Some(transaction_hash) =
                storage::remove_receipt_from_watching_list(redis_connection_manager, &receipt_id)
                    .await?
            {
                send_trigger_to_queue(
                    alert_rule,
                    &transaction_hash,
                    &receipt_id,
                    queue_client,
                    queue_url,
                )
                .await?;
            } else {
                tracing::error!(
                    target: crate::INDEXER,
                    "Missing Receipt {}. Not found in watching list",
                    &receipt_id,
                );
            }
        }
    }
    Ok(())
}

async fn send_trigger_to_queue(
    alert_rule: &AlertRule,
    transaction_hash: &str,
    receipt_id: &str,
    queue_client: &shared::QueueClient,
    queue_url: &str,
) -> anyhow::Result<()> {
    loop {
        match shared::send_to_the_queue(
            queue_client,
            queue_url.to_string(),
            shared::types::primitives::AlertQueueMessage {
                alert_rule_id: alert_rule.id,
                payload: shared::types::primitives::ActionsAlertPayload {
                    receipt_id: receipt_id.to_string(),
                    transaction_hash: transaction_hash.to_string(),
                },
            },
        )
        .await
        {
            Ok(_) => break,
            Err(err) => {
                tracing::error!(
                    target: crate::INDEXER,
                    "Error sending the alert to the queue. Retrying in 1s...\n{:#?}",
                    err,
                );
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
    Ok(())
}
