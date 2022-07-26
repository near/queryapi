use std::str::FromStr;

use borsh::{BorshDeserialize, BorshSerialize};
use cached::Cached;
use futures::future::try_join_all;
use serde::{Deserialize, Serialize};

use near_jsonrpc_client::errors::JsonRpcError;
use near_jsonrpc_primitives::types::query::RpcQueryError;
use near_lake_framework::near_indexer_primitives::{
    types,
    views::{self, ExecutionStatusView},
    CryptoHash, IndexerExecutionOutcomeWithReceipt, IndexerTransactionWithOutcome,
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
                receipt_id,
                &cache_value.try_to_vec().unwrap(),
            )
            .await?;

            let push_receipt_to_watching_list_future =
                children_receipt_ids.iter().map(|receipt_id_string| async {
                    let cache_value_bytes = CacheValue {
                        parent_receipt_id: Some(receipt_id.to_string()),
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

pub(crate) async fn get_balance_retriable(
    account_id: &types::AccountId,
    block_hash: &str,
    balance_cache: &crate::BalanceCache,
    json_rpc_client: &near_jsonrpc_client::JsonRpcClient,
) -> anyhow::Result<crate::BalanceDetails> {
    let mut interval = crate::INTERVAL;
    let mut retry_attempt = 0usize;

    loop {
        if retry_attempt == crate::RETRY_COUNT {
            anyhow::bail!(
                "Failed to perform query to RPC after {} attempts. Stop trying.\nAccount {}, block_hash {}",
                crate::RETRY_COUNT,
                account_id.to_string(),
                block_hash.to_string()
            );
        }
        retry_attempt += 1;

        match get_balance(account_id, block_hash, balance_cache, json_rpc_client).await {
            Ok(res) => return Ok(res),
            Err(err) => {
                tracing::error!(
                    target: crate::INDEXER,
                    "Failed to request account view details from RPC for account {}, block_hash {}.{}\n Retrying in {} milliseconds...",
                    account_id.to_string(),
                    block_hash.to_string(),
                    err,
                    interval.as_millis(),
                );
                tokio::time::sleep(interval).await;
                if interval < crate::MAX_DELAY_TIME {
                    interval *= 2;
                }
            }
        }
    }
}

async fn get_balance(
    account_id: &types::AccountId,
    block_hash: &str,
    balance_cache: &crate::BalanceCache,
    json_rpc_client: &near_jsonrpc_client::JsonRpcClient,
) -> anyhow::Result<crate::BalanceDetails> {
    let mut balances_cache_lock = balance_cache.lock().await;
    let result = match balances_cache_lock.cache_get(account_id) {
        None => {
            let account_balance =
                match get_account_view(json_rpc_client, account_id, block_hash).await {
                    Ok(account_view) => Ok(crate::BalanceDetails {
                        non_staked: account_view.amount,
                        staked: account_view.locked,
                    }),
                    Err(err) => match err.handler_error() {
                        Some(RpcQueryError::UnknownAccount { .. }) => Ok(crate::BalanceDetails {
                            non_staked: 0,
                            staked: 0,
                        }),
                        _ => Err(err.into()),
                    },
                };
            if let Ok(balance) = account_balance {
                balances_cache_lock.cache_set(account_id.clone(), balance);
            }
            account_balance
        }
        Some(balance) => Ok(*balance),
    };
    drop(balances_cache_lock);
    result
}

pub(crate) async fn save_latest_balance(
    account_id: types::AccountId,
    balance: &crate::BalanceDetails,
    balance_cache: &crate::BalanceCache,
) {
    let mut balances_cache_lock = balance_cache.lock().await;
    balances_cache_lock.cache_set(
        account_id,
        crate::BalanceDetails {
            non_staked: balance.non_staked,
            staked: balance.staked,
        },
    );
    drop(balances_cache_lock);
}

async fn get_account_view(
    json_rpc_client: &near_jsonrpc_client::JsonRpcClient,
    account_id: &types::AccountId,
    block_hash: &str,
) -> Result<views::AccountView, JsonRpcError<RpcQueryError>> {
    let query = near_jsonrpc_client::methods::query::RpcQueryRequest {
        block_reference: types::BlockReference::BlockId(types::BlockId::Hash(
            CryptoHash::from_str(block_hash).unwrap(),
        )),
        request: views::QueryRequest::ViewAccount {
            account_id: account_id.clone(),
        },
    };

    let account_response = json_rpc_client.call(query).await?;
    match account_response.kind {
        near_jsonrpc_primitives::types::query::QueryResponseKind::ViewAccount(account) => {
            Ok(account)
        }
        _ => unreachable!(
            "Unreachable code! Asked for ViewAccount (block_hash {}, account_id {})\nReceived\n\
                {:#?}\nReport this to https://github.com/near/near-jsonrpc-client-rs",
            block_hash.to_string(),
            account_id.to_string(),
            account_response.kind
        ),
    }
}
