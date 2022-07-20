use borsh::{BorshDeserialize, BorshSerialize};
use futures::future::try_join_all;
use serde::{Deserialize, Serialize};

use near_lake_framework::near_indexer_primitives::{
    views::ExecutionStatusView, IndexerExecutionOutcomeWithReceipt, IndexerTransactionWithOutcome,
};

#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug)]
pub(crate) struct CacheValue {
    pub transaction_hash: String,
    pub parent_receipt_id: Option<String>,
    pub children_receipt_ids: Vec<String>,
}

pub(crate) async fn cache_txs_and_receipts(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    redis_connection_manager: &storage::ConnectionManager,
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

        let cache_value = CacheValue {
            transaction_hash: transaction_hash_string,
            parent_receipt_id: None,
            children_receipt_ids: vec![],
        };

        return storage::push_receipt_to_watching_list(
            redis_connection_manager,
            &converted_into_receipt_id,
            &cache_value.try_to_vec().unwrap(),
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
    let cache_futures = receipt_execution_outcomes
        .iter()
        .map(|receipt_execution_outcome| {
            cache_receipts_from_execution_outcome(
                receipt_execution_outcome,
                redis_connection_manager,
            )
        });

    try_join_all(cache_futures).await?;
    Ok(())
}

async fn cache_receipts_from_execution_outcome(
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<()> {
    let receipt_id = &receipt_execution_outcome.receipt.receipt_id.to_string();
    if let Ok(Some(cache_value_bytes)) =
        storage::get::<Option<Vec<u8>>>(redis_connection_manager, &receipt_id).await
    {
        // Add the newly produced receipt_ids to the watching list
        let mut children_receipt_ids: Vec<String> = receipt_execution_outcome
            .execution_outcome
            .outcome
            .receipt_ids
            .iter()
            .map(ToString::to_string)
            .collect();

        // Add the success receipt to the watching list
        if let ExecutionStatusView::SuccessReceiptId(receipt_id) =
            receipt_execution_outcome.execution_outcome.outcome.status
        {
            children_receipt_ids.push(receipt_id.to_string());
        }

        if !children_receipt_ids.is_empty() {
            // Rewrite CacheValue
            let mut cache_value = CacheValue::try_from_slice(&cache_value_bytes)?;
            cache_value.children_receipt_ids = children_receipt_ids.clone();
            storage::push_receipt_to_watching_list(
                redis_connection_manager,
                &receipt_id,
                &cache_value.try_to_vec().unwrap(),
            )
            .await?;

            let push_receipt_to_watching_list_future =
                children_receipt_ids.iter().map(|receipt_id_string| async {
                    let cache_value_bytes = CacheValue {
                        parent_receipt_id: Some(receipt_id.to_string().clone()),
                        transaction_hash: cache_value.transaction_hash.clone(),
                        children_receipt_ids: vec![],
                    }
                    .try_to_vec()
                    .expect("Failed to BorshSerialize CacheValue");
                    return storage::push_receipt_to_watching_list(
                        redis_connection_manager,
                        receipt_id_string,
                        &cache_value_bytes,
                    )
                    .await;
                });
            try_join_all(push_receipt_to_watching_list_future).await?;
        }
    }
    Ok(())
}
