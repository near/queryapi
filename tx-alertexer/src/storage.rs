use redis::aio::ConnectionManager;

use near_lake_framework::near_indexer_primitives::{
    views::ExecutionStatusView, IndexerExecutionOutcomeWithReceipt,
};

use shared::{
    types::{primitives::TransactionHashString, transactions::TransactionDetails},
    BorshDeserialize, BorshSerialize,
};

const REDIS_CON_STRING: &str = "redis://127.0.0.1/";
const TX_TO_SEND_LIST_KEY: &str = "transactions_to_send";

async fn get_redis_client() -> redis::Client {
    redis::Client::open(REDIS_CON_STRING).expect("can create redis client")
}

pub async fn connect() -> anyhow::Result<ConnectionManager> {
    Ok(get_redis_client()
        .await
        .get_tokio_connection_manager()
        .await?)
}

pub async fn set_str(
    redis_connection_manager: &ConnectionManager,
    key: &str,
    value: &str,
) -> anyhow::Result<()> {
    redis::cmd("SET")
        .arg(&[key, value])
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(())
}

pub async fn get_str(
    redis_connection_manager: &ConnectionManager,
    key: &str,
) -> anyhow::Result<String> {
    let value: String = redis::cmd("GET")
        .arg(&[key])
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(value)
}

pub async fn set_tx(
    redis_connection_manager: &ConnectionManager,
    transaction_details: TransactionDetails,
) -> anyhow::Result<()> {
    let transaction_hash_string = transaction_details.transaction.hash.to_string();
    let encoded_tx_details = transaction_details.try_to_vec()?;

    redis::cmd("SET")
        .arg(&transaction_hash_string)
        .arg(&encoded_tx_details)
        .query_async(&mut redis_connection_manager.clone())
        .await?;
    tracing::debug!(
        target: crate::INDEXER,
        "TX added for collecting {}",
        &transaction_hash_string
    );
    Ok(())
}

pub async fn del(redis_connection_manager: &ConnectionManager, key: &str) -> anyhow::Result<()> {
    redis::cmd("DEL")
        .arg(key)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(())
}

pub async fn get_tx(
    redis_connection_manager: &ConnectionManager,
    transaction_hash: &str,
) -> anyhow::Result<Option<TransactionDetails>> {
    let value: Vec<u8> = redis::cmd("GET")
        .arg(transaction_hash)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(Some(TransactionDetails::try_from_slice(&value)?))
}

pub async fn push_receipt_id_to_watching_list(
    redis_connection_manager: &ConnectionManager,
    receipt_id: &str,
    transaction_hash: &str,
) -> anyhow::Result<()> {
    redis::cmd("INCR")
        .arg(format!("receipts_{}", transaction_hash))
        .query_async(&mut redis_connection_manager.clone())
        .await?;
    set_str(redis_connection_manager, receipt_id, transaction_hash).await
}

pub async fn receipt_id_exists_in_watching_list(
    redis_connection_manager: &ConnectionManager,
    receipt_id: &str,
) -> anyhow::Result<bool> {
    let value: bool = redis::cmd("EXISTS")
        .arg(receipt_id)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(value)
}

async fn get_receipt_id_from_watching_list(
    redis_connection_manager: &ConnectionManager,
    receipt_id: &str,
) -> anyhow::Result<Option<TransactionHashString>> {
    let value: Option<TransactionHashString> = redis::cmd("GET")
        .arg(receipt_id)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(value)
}

pub async fn remove_receipt_id_from_watching_list(
    redis_connection_manager: &ConnectionManager,
    receipt_id: &str,
) -> anyhow::Result<Option<TransactionHashString>> {
    match get_receipt_id_from_watching_list(redis_connection_manager, receipt_id).await {
        Ok(maybe_transaction_hash) => {
            if let Some(ref transaction_hash) = maybe_transaction_hash {
                redis::cmd("DECR")
                    .arg(format!("receipts_{}", transaction_hash))
                    .query_async(&mut redis_connection_manager.clone())
                    .await?;
                del(redis_connection_manager, receipt_id).await?;
            }
            Ok(maybe_transaction_hash)
        }
        Err(e) => {
            tracing::error!(
                target: crate::INDEXER,
                "Failed to remove receipt from watching list\n{:#?}",
                e
            );
            anyhow::bail!(e);
        }
    }
}

async fn tx_receipts_watching_count(
    redis_connection_manager: &ConnectionManager,
    transaction_hash: &str,
) -> anyhow::Result<u64> {
    Ok(redis::cmd("GET")
        .arg(format!("receipts_{}", transaction_hash))
        .query_async(&mut redis_connection_manager.clone())
        .await?)
}

pub async fn push_tx_to_send(
    redis_connection_manager: &ConnectionManager,
    transaction_details: TransactionDetails,
) -> anyhow::Result<()> {
    let encoded_tx_details = transaction_details.try_to_vec()?;

    redis::cmd("RPUSH")
        .arg(TX_TO_SEND_LIST_KEY)
        .arg(&encoded_tx_details)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    Ok(())
}

pub async fn transactions_to_send(
    redis_connection_manager: &ConnectionManager,
) -> anyhow::Result<Vec<TransactionDetails>> {
    let length: usize = redis::cmd("LLEN")
        .arg(TX_TO_SEND_LIST_KEY)
        .query_async(&mut redis_connection_manager.clone())
        .await?;

    let values: Vec<Vec<u8>> = redis::cmd("LPOP")
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
        remove_receipt_id_from_watching_list(
            redis_connection_manager,
            &indexer_execution_outcome_with_receipt
                .receipt
                .receipt_id
                .to_string(),
        )
        .await;
        transaction_details
            .receipts
            .push(indexer_execution_outcome_with_receipt.receipt);

        transaction_details.execution_outcomes.push(
            indexer_execution_outcome_with_receipt
                .execution_outcome
                .clone(),
        );

        let transaction_receipts_watching_count =
            tx_receipts_watching_count(redis_connection_manager, transaction_hash).await?;
        if transaction_receipts_watching_count == 0 {
            tracing::debug!(target: crate::INDEXER, "Finished TX {}", &transaction_hash,);

            push_tx_to_send(redis_connection_manager, transaction_details).await?;
            del(redis_connection_manager, transaction_hash).await?;
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
