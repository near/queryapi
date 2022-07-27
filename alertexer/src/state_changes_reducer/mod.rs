use borsh::BorshDeserialize;

use futures::{
    future::try_join_all,
    stream::{self, StreamExt},
};

use near_lake_framework::near_indexer_primitives::views::{
    StateChangeCauseView, StateChangeWithCauseView,
};

use alert_rules::AlertRule;
use shared::types::primitives::{AlertQueueMessage, AlertQueueMessagePayload};

mod matcher;

pub(crate) async fn reduce_alert_queue_messages_from_state_changes(
    alert_rule: &AlertRule,
    context: &crate::AlertexerContext<'_>,
) -> anyhow::Result<Vec<AlertQueueMessage>> {
    let state_changes: Vec<&StateChangeWithCauseView> = context
        .streamer_message
        .shards
        .iter()
        .flat_map(|shard| shard.state_changes.iter())
        .collect();

    let matching_state_changes = stream::iter(state_changes.iter())
        .filter(|state_change_with_cause| async {
            matcher::match_state_change_account_balance(
                &alert_rule.matching_rule,
                state_change_with_cause,
                context,
            )
            .await
        })
        .map(|state_change_with_cause| {
            build_alert_queue_message(alert_rule, state_change_with_cause, context)
        })
        .collect::<Vec<_>>()
        .await;

    try_join_all(matching_state_changes).await
}

async fn build_alert_queue_message(
    alert_rule: &AlertRule,
    state_change_with_cause: &StateChangeWithCauseView,
    context: &crate::AlertexerContext<'_>,
) -> anyhow::Result<AlertQueueMessage> {
    let payload = match state_change_with_cause.cause {
        StateChangeCauseView::TransactionProcessing { tx_hash } => {
            AlertQueueMessagePayload::StateChanges {
                block_hash: context.streamer_message.block.header.prev_hash.to_string(),
                receipt_id: None,
                transaction_hash: tx_hash.to_string(),
            }
        }
        StateChangeCauseView::ActionReceiptProcessingStarted { receipt_hash }
        | StateChangeCauseView::ActionReceiptGasReward { receipt_hash }
        | StateChangeCauseView::ReceiptProcessing { receipt_hash }
        | StateChangeCauseView::PostponedReceipt { receipt_hash } => {
            let transaction_hash_string = get_parent_tx_for_receipt_from_cache(
                &receipt_hash.to_string(),
                context.redis_connection_manager,
            )
            .await?
            .expect("Failed to get parent transaction hash from the cache");
            AlertQueueMessagePayload::StateChanges {
                block_hash: context.streamer_message.block.header.prev_hash.to_string(),
                receipt_id: Some(receipt_hash.to_string()),
                transaction_hash: transaction_hash_string,
            }
        }
        _ => {
            unreachable!("Unreachable code. Didn't expect to process StateChangeCause that doesn't include either transation_hash or receipt_hash");
        }
    };

    Ok(AlertQueueMessage {
        chain_id: context.chain_id.clone(),
        alert_rule_id: alert_rule.id,
        alert_name: alert_rule.name.clone(),
        payload,
    })
}

async fn get_parent_tx_for_receipt_from_cache(
    receipt_id: &str,
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<Option<String>> {
    if let Some(cache_value_bytes) =
        storage::get::<Option<Vec<u8>>>(redis_connection_manager, receipt_id).await?
    {
        let cache_value = crate::cache::CacheValue::try_from_slice(&cache_value_bytes)?;

        Ok(Some(cache_value.transaction_hash))
    } else {
        Ok(None)
    }
}
