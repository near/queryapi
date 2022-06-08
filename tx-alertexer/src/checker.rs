use futures::future::{join_all, try_join_all};

use alert_rules::TxAlertRule;
use near_lake_framework::{
    near_indexer_primitives::views::ExecutionStatusView,
    near_indexer_primitives::IndexerTransactionWithOutcome,
};
use shared::types::transactions::TransactionDetails;

pub(crate) async fn transactions(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    transaction_alert_rules: &[TxAlertRule],
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<()> {
    let futures = transaction_alert_rules
        .iter()
        .map(|tx_alert_rule| tx_matcher(streamer_message, tx_alert_rule, redis_connection_manager));

    join_all(futures).await;

    outcomes_and_receipts(streamer_message, redis_connection_manager).await;

    let finished_transaction_details =
        crate::storage_ext::transactions_to_send(redis_connection_manager).await?;

    if !finished_transaction_details.is_empty() {
        tokio::spawn(async move {
            let send_finished_transaction_details_futures = finished_transaction_details
                .into_iter()
                .map(send_transaction_details);

            join_all(send_finished_transaction_details_futures).await;
        });
    }

    Ok(())
}

async fn tx_matcher(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    alert_rule: &TxAlertRule,
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<()> {
    let futures = streamer_message
        .shards
        .iter()
        .filter_map(|shard| shard.chunk.as_ref())
        .flat_map(|chunk| chunk.transactions.iter())
        .filter_map(|tx| {
            if tx.transaction.signer_id.to_string() == alert_rule.account_id
                || tx.transaction.receiver_id.to_string() == alert_rule.account_id
            {
                Some(start_collecting_tx(
                    tx,
                    alert_rule,
                    streamer_message,
                    redis_connection_manager,
                ))
            } else {
                None
            }
        });
    try_join_all(futures).await.map(|_| ())
}

async fn start_collecting_tx(
    transaction: &IndexerTransactionWithOutcome,
    alert_rule: &TxAlertRule,
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<()> {
    let transaction_hash_string = transaction.transaction.hash.to_string();
    let converted_into_receipt_id = transaction
        .outcome
        .execution_outcome
        .outcome
        .receipt_ids
        .first()
        .expect("`receipt_ids` must contain one Receipt ID")
        .to_string();

    let transaction_details = TransactionDetails::from_indexer_tx(transaction.clone());
    match crate::storage_ext::set_tx(redis_connection_manager, transaction_details).await {
        Ok(_) => {
            storage::push_receipt_to_watching_list(
                redis_connection_manager,
                &converted_into_receipt_id,
                &transaction_hash_string,
            )
            .await?;
        }
        Err(e) => tracing::error!(
            target: crate::INDEXER,
            "Failed to add TransactionDetails to Redis\n{:#?}",
            e
        ),
    }

    Ok(())
}

async fn outcomes_and_receipts(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    redis_connection_manager: &storage::ConnectionManager,
) {
    let receipt_execution_outcomes = streamer_message
        .shards
        .iter()
        .flat_map(|shard| shard.receipt_execution_outcomes.iter());

    for receipt_execution_outcome in receipt_execution_outcomes {
        if let Ok(Some(transaction_hash)) = storage::remove_receipt_from_watching_list(
            redis_connection_manager,
            &receipt_execution_outcome.receipt.receipt_id.to_string(),
        )
        .await
        {
            tracing::debug!(
                target: crate::INDEXER,
                "-R {}",
                &receipt_execution_outcome.receipt.receipt_id.to_string(),
            );
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
                .await;
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
                .await;
            }

            match crate::storage_ext::push_outcome_and_receipt(
                redis_connection_manager,
                &transaction_hash,
                receipt_execution_outcome.clone(),
            )
            .await
            {
                Ok(_) => {}
                Err(e) => tracing::error!(
                    target: crate::INDEXER,
                    "Failed to push_outcome_and_receipt\n{:#?}",
                    e
                ),
            };
        }
    }
}

async fn send_transaction_details(transaction_details: TransactionDetails) -> bool {
    loop {
        match queue_sender::send_to_the_queue(format!(
            "TX {} affects {}\n",
            transaction_details.transaction.hash,
            transaction_details.transaction.signer_id,
            // &transaction_details
        ))
        .await
        {
            Ok(_) => break true,
            Err(err) => {
                tracing::error!(
                    target: crate::INDEXER,
                    "Error sending the alert to the queue. Retrying in 1s...{:#?}",
                    err
                );
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}
