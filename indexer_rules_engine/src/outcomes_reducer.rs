use futures::future::try_join_all;

use near_lake_framework::near_indexer_primitives::{StreamerMessage, IndexerExecutionOutcomeWithReceipt};
use crate::types::events::Event;
use crate::types::indexer_rule::{IndexerRule, MatchingRule};
use crate::types::indexer_rule_match::{ChainId, IndexerRuleMatch, IndexerRuleMatchPayload};
use crate::matcher;

pub async fn reduce_indexer_rule_matches_from_outcomes(
    indexer_rule: &IndexerRule,
    streamer_message: &StreamerMessage,
    chain_id: ChainId,
) -> anyhow::Result<Vec<IndexerRuleMatch>> {
    let build_indexer_rule_match_futures = streamer_message
        .shards
        .iter()
        .flat_map(|shard| {
            shard
                .receipt_execution_outcomes
                .iter()
                .filter(|receipt_execution_outcome| {
                    matcher::matches(&indexer_rule.matching_rule, receipt_execution_outcome)
                })
        })
        .map(|receipt_execution_outcome| {
            build_indexer_rule_match(indexer_rule,
                                     receipt_execution_outcome,
                                     streamer_message.block.header.hash.to_string(),
                                     streamer_message.block.header.height,
                                     chain_id.clone(),
            )
        });

    try_join_all(build_indexer_rule_match_futures).await
}

async fn build_indexer_rule_match(
    indexer_rule: &IndexerRule,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    block_header_hash: String,
    block_height: u64,
    chain_id: ChainId,
) -> anyhow::Result<IndexerRuleMatch> {

    Ok(IndexerRuleMatch {
        chain_id: chain_id.clone(),
        indexer_rule_id: indexer_rule.id,
        indexer_rule_name: indexer_rule.name.clone(),
        payload: build_indexer_rule_match_payload(
            indexer_rule,
            receipt_execution_outcome,
            block_header_hash,
        ),
        block_height,
    })
}

fn build_indexer_rule_match_payload(
    indexer_rule: &IndexerRule,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    block_header_hash: String,
) -> IndexerRuleMatchPayload {

    // future enhancement will extract and enrich fields from block & context as
    //   specified in the indexer function config.
    let transaction_hash = None;

    match &indexer_rule.matching_rule {
        MatchingRule::ActionAny { .. }
        | MatchingRule::ActionFunctionCall { .. } => {
            IndexerRuleMatchPayload::Actions {
                block_hash: block_header_hash.to_string(),
                receipt_id: receipt_execution_outcome.receipt.receipt_id.to_string(),
                transaction_hash,
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
                .expect("Failed to get the matched Event itself while building the IndexerRuleMatchPayload")
                .clone();

            IndexerRuleMatchPayload::Events {
                block_hash: block_header_hash.to_string(),
                receipt_id: receipt_execution_outcome.receipt.receipt_id.to_string(),
                transaction_hash,
                event: event.event.clone(),
                standard: event.standard.clone(),
                version: event.version.clone(),
                data: event.data.as_ref().map(|data| data.to_string())
            }
        }
    }
}
