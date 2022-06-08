use storage::ConnectionManager;

use near_lake_framework::near_indexer_primitives::IndexerExecutionOutcomeWithReceipt;

use shared::{types::transactions::TransactionDetails, BorshDeserialize, BorshSerialize};

const TX_TO_SEND_LIST_KEY: &str = "transactions_to_send";

pub async fn set_tx(
    redis_connection_manager: &ConnectionManager,
    transaction_details: TransactionDetails,
) -> anyhow::Result<()> {
    let transaction_hash_string = transaction_details.transaction.hash.to_string();
    let encoded_tx_details = transaction_details.try_to_vec()?;

    storage::set(
        redis_connection_manager,
        &transaction_hash_string,
        &encoded_tx_details,
    )
    .await?;

    tracing::debug!(
        target: crate::INDEXER,
        "TX added for collecting {}",
        &transaction_hash_string
    );
    Ok(())
}

pub async fn get_tx(
    redis_connection_manager: &ConnectionManager,
    transaction_hash: &str,
) -> anyhow::Result<Option<TransactionDetails>> {
    let value: Vec<u8> = storage::get(redis_connection_manager, transaction_hash).await?;

    Ok(Some(TransactionDetails::try_from_slice(&value)?))
}

pub async fn push_tx_to_send(
    redis_connection_manager: &ConnectionManager,
    transaction_details: TransactionDetails,
) -> anyhow::Result<()> {
    let encoded_tx_details = transaction_details.try_to_vec()?;

    storage::redis::cmd("RPUSH")
        .arg(TX_TO_SEND_LIST_KEY)
        .arg(&encoded_tx_details)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(())
}

pub async fn transactions_to_send(
    redis_connection_manager: &ConnectionManager,
) -> anyhow::Result<Vec<TransactionDetails>> {
    let length: usize = storage::redis::cmd("LLEN")
        .arg(TX_TO_SEND_LIST_KEY)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    let values: Vec<Vec<u8>> = storage::redis::cmd("LPOP")
        .arg(TX_TO_SEND_LIST_KEY)
        .arg(length)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    let tx_details: Vec<TransactionDetails> = values
        .iter()
        .filter_map(|value| TransactionDetails::try_from_slice(value).ok())
        .collect();

    Ok(tx_details)
}

pub async fn push_outcome_and_receipt(
    redis_connection_manager: &ConnectionManager,
    transaction_hash: &str,
    indexer_execution_outcome_with_receipt: IndexerExecutionOutcomeWithReceipt,
) -> anyhow::Result<()> {
    if let Ok(Some(mut transaction_details)) =
        get_tx(redis_connection_manager, transaction_hash).await
    {
        tracing::debug!(
            target: crate::INDEXER,
            "-R {}",
            &indexer_execution_outcome_with_receipt
                .receipt
                .receipt_id
                .to_string(),
        );
        storage::remove_receipt_from_watching_list(
            redis_connection_manager,
            &indexer_execution_outcome_with_receipt
                .receipt
                .receipt_id
                .to_string(),
        )
        .await?;
        transaction_details
            .receipts
            .push(indexer_execution_outcome_with_receipt.receipt);

        transaction_details.execution_outcomes.push(
            indexer_execution_outcome_with_receipt
                .execution_outcome
                .clone(),
        );

        let transaction_receipts_watching_count =
            storage::receipts_transaction_hash_count(redis_connection_manager, transaction_hash)
                .await?;
        if transaction_receipts_watching_count == 0 {
            tracing::debug!(target: crate::INDEXER, "Finished TX {}", &transaction_hash,);

            push_tx_to_send(redis_connection_manager, transaction_details).await?;
            storage::del(redis_connection_manager, transaction_hash).await?;
        } else {
            tracing::debug!(
                target: crate::INDEXER,
                "{} | UPDATE TX {}",
                transaction_receipts_watching_count,
                &transaction_hash
            );
            set_tx(redis_connection_manager, transaction_details).await?;
        }
    } else {
        tracing::debug!(target: crate::INDEXER, "Missing TX {}", &transaction_hash);
    }
    Ok(())
}
