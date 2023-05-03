use borsh::BorshDeserialize;
use futures::future::try_join_all;

use near_lake_framework::near_indexer_primitives::IndexerExecutionOutcomeWithReceipt;

use alert_rules::{AlertRule, MatchingRule};
use shared::alertexer_types::{
    events::Event,
    primitives::{AlertQueueMessage, AlertQueueMessagePayload},
};

pub mod indexer_reducer;
mod matcher;

pub(crate) async fn reduce_alert_queue_messages_from_outcomes(
    alert_rule: &AlertRule,
    context: &crate::QueryApiContext<'_>,
) -> anyhow::Result<Vec<AlertQueueMessage>> {
    let build_alert_queue_message_futures = context
        .streamer_message
        .shards
        .iter()
        .flat_map(|shard| {
            shard
                .receipt_execution_outcomes
                .iter()
                .filter(|receipt_execution_outcome| {
                    matcher::matches(&alert_rule.matching_rule, receipt_execution_outcome)
                })
        })
        .map(|receipt_execution_outcome| {
            build_alert_queue_message(alert_rule, receipt_execution_outcome, context)
        });

    try_join_all(build_alert_queue_message_futures).await
}

async fn build_alert_queue_message(
    alert_rule: &AlertRule,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    context: &crate::QueryApiContext<'_>,
) -> anyhow::Result<AlertQueueMessage> {
    let transaction_hash = parent_transaction_hash(
        &receipt_execution_outcome.receipt.receipt_id.to_string(),
        context,
    )
    .await?;

    Ok(AlertQueueMessage {
        chain_id: context.chain_id.clone(),
        alert_rule_id: alert_rule.id,
        alert_name: alert_rule.name.clone(),
        payload: build_alert_queue_message_payload(
            alert_rule,
            &transaction_hash,
            receipt_execution_outcome,
            context,
        ),
        block_height: context.streamer_message.block.header.height,
    })
}

async fn parent_transaction_hash(
    receipt_id: &str,
    context: &crate::QueryApiContext<'_>,
) -> anyhow::Result<String> {
    if let Some(cache_value_bytes) =
        storage::get::<Option<Vec<u8>>>(context.redis_connection_manager, &receipt_id).await?
    {
        let cache_value = crate::cache::CacheValue::try_from_slice(&cache_value_bytes)?;

        return Ok(cache_value.transaction_hash);
    }
    anyhow::bail!("Missing Receipt {}. Not found in Redis cache", receipt_id,)
}

fn build_alert_queue_message_payload(
    alert_rule: &AlertRule,
    transaction_hash: &str,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    context: &crate::QueryApiContext,
) -> AlertQueueMessagePayload {
    match &alert_rule.matching_rule {
        MatchingRule::ActionAny { .. }
        | MatchingRule::ActionTransfer { .. }
        | MatchingRule::ActionFunctionCall { .. } => {
            AlertQueueMessagePayload::Actions {
                block_hash: context.streamer_message.block.header.hash.to_string(),
                receipt_id: receipt_execution_outcome.receipt.receipt_id.to_string(),
                transaction_hash: transaction_hash.to_string(),
            }
        }
        MatchingRule::Event { event, standard, version, .. } => {
            let event = receipt_execution_outcome
                .execution_outcome
                .outcome
                .logs
                .iter()
                .filter_map(|log| Event::from_log(log).ok())
                .filter_map(|near_event| {
                    if vec![
                        wildmatch::WildMatch::new(event).matches(&near_event.event),
                        wildmatch::WildMatch::new(standard).matches(&near_event.standard),
                        wildmatch::WildMatch::new(version).matches(&near_event.version),
                    ].into_iter().all(|val| val) {
                        Some(near_event)
                    } else {
                        None
                    }
                })
                .collect::<Vec<Event>>()
                .first()
                .expect("Failed to get the matched Event itself while building the AlertQueueMessagePayload")
                .clone();

            AlertQueueMessagePayload::Events {
                block_hash: context.streamer_message.block.header.hash.to_string(),
                receipt_id: receipt_execution_outcome.receipt.receipt_id.to_string(),
                transaction_hash: transaction_hash.to_string(),
                event: event.event.clone(),
                standard: event.standard.clone(),
                version: event.version.clone(),
                data: event.data.as_ref().map(|data| data.to_string())
            }
        }
        MatchingRule::StateChangeAccountBalance { .. } => unreachable!("Unreachable code! Got StateChanges based MatchingRule we don't expect in `outcomes` checker"),
    }
}
