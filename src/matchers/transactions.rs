use crate::types::TxAlertRule;
use futures::future::{join_all, try_join_all};
use near_lake_framework::{
    near_indexer_primitives::IndexerTransactionWithOutcome,
    near_indexer_primitives::views::ExecutionStatusView,
};

pub(crate) async fn transactions(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    transaction_alert_rules: &[TxAlertRule],
    alertexer_memory: crate::types::AlertexerMemory,
) -> anyhow::Result<()> {
    let futures = transaction_alert_rules
        .iter()
        .map(|tx_alert_rule| {
            tx_matcher(
                streamer_message,
                tx_alert_rule,
                std::sync::Arc::clone(&alertexer_memory),
            )
        });

    join_all(futures).await;

    let alertexer_memory_lock = alertexer_memory.lock().await;
    let watching_receipts_list = alertexer_memory_lock.watching_receipts_list.clone();
    drop(alertexer_memory_lock);

    outcomes_and_receipts(
        streamer_message,
        watching_receipts_list,
        std::sync::Arc::clone(&alertexer_memory),
    ).await;

    let mut alertexer_memory_lock = alertexer_memory.lock().await;
    let finished_transaction_details: crate::types::GatheringTransactionDetails = alertexer_memory_lock
        .gathering_transactions
        .drain_filter(|_transaction_hash, transaction_details| transaction_details.is_finished())
        .collect();
    drop(alertexer_memory_lock);

    tokio::spawn(async move {
        let send_finished_transaction_details_futures = finished_transaction_details
            .into_values()
            .map(|transaction_details| send_transaction_details(transaction_details));

        join_all(send_finished_transaction_details_futures).await;
    });

    Ok(())
}

async fn tx_matcher(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    alert_rule: &TxAlertRule,
    alertexer_memory: crate::types::AlertexerMemory,
) -> anyhow::Result<()> {
    let futures = streamer_message
        .shards
        .iter()
        .filter_map(|shard| shard.chunk.as_ref())
        .map(|chunk| chunk.transactions.iter())
        .flatten()
        .filter_map(|tx| {
            if tx.transaction.signer_id.to_string() == alert_rule.account_id
                || tx.transaction.receiver_id.to_string() == alert_rule.account_id
            {
                Some(tx_handler(
                    tx,
                    alert_rule,
                    streamer_message,
                    std::sync::Arc::clone(&alertexer_memory),
                ))
            } else {
                None
            }
        });
    try_join_all(futures).await.map(|_| ())
}

async fn tx_handler(
    transaction: &IndexerTransactionWithOutcome,
    alert_rule: &TxAlertRule,
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    alertexer_memory: crate::types::AlertexerMemory,
) -> anyhow::Result<()> {
    let mut alertexer_memory_lock = alertexer_memory.lock().await;
    alertexer_memory_lock.push_transaction(transaction.clone())?;
    drop(alertexer_memory_lock);
    Ok(())
}

async fn outcomes_and_receipts(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    mut watching_receipts_list: crate::types::WatchingReceiptsList,
    alertexer_memory: crate::types::AlertexerMemory,
) {
    let receipt_execution_outcomes = streamer_message
        .shards
        .iter()
        .map(|shard| shard.receipt_execution_outcomes.iter())
        .flatten();

    for receipt_execution_outcome in receipt_execution_outcomes {
        if let Some(transaction_hash) = watching_receipts_list
            .remove(&receipt_execution_outcome.receipt.receipt_id.to_string()) {
            tracing::debug!(
                target: crate::INDEXER,
                "-R {}",
                &receipt_execution_outcome.receipt.receipt_id.to_string(),
            );
            // Add the newly produced receipt_ids to the watching list
            for receipt_id in receipt_execution_outcome.execution_outcome.outcome.receipt_ids.iter() {
                tracing::debug!(
                    target: crate::INDEXER,
                    "+R {}",
                    &receipt_id.to_string(),
                );
                watching_receipts_list.insert(
                    receipt_id.to_string(),
                    transaction_hash.clone()
                );
            }

            // Add the success receipt to the watching list
            match receipt_execution_outcome.execution_outcome.outcome.status {
                ExecutionStatusView::SuccessReceiptId(receipt_id) => {
                    tracing::debug!(
                        target: crate::INDEXER,
                        "+R {}",
                        &receipt_id.to_string(),
                    );
                    watching_receipts_list.insert(receipt_id.to_string(), transaction_hash.clone());
                },
                _ => {}
            };
            let mut alertexer_memory_lock = alertexer_memory.lock().await;
            alertexer_memory_lock.push_outcome_and_receipt(
                &transaction_hash,
                receipt_execution_outcome.clone(),
            );
            drop(alertexer_memory_lock);
        }
    }
    // Extend the global watching list with our locally gathered new items
    let mut alertexer_memory_lock = alertexer_memory.lock().await;
    alertexer_memory_lock.watching_receipts_list.extend(watching_receipts_list);
    drop(alertexer_memory_lock);
}

async fn send_transaction_details(transaction_details: crate::types::TransactionDetails) -> bool {

    loop {
        match crate::sender::send_to_the_queue(format!(
            "TX {} affects {}\n",
            transaction_details.transaction.hash, transaction_details.transaction.signer_id.to_string(),
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

