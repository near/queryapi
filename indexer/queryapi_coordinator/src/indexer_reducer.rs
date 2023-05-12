use borsh::BorshDeserialize;

use near_lake_framework::near_indexer_primitives::views::{ActionView, ReceiptEnumView};
use near_lake_framework::near_indexer_primitives::{IndexerExecutionOutcomeWithReceipt, StreamerMessage};

use indexer_rules_engine::types::indexer_rule::IndexerRule;
use indexer_rules_engine::types::indexer_rule_match::ChainId;
use indexer_rules_engine::matcher;

pub(crate) fn reduce_function_registry_from_outcomes(
    indexer_rule: &IndexerRule,
    streamer_message: &StreamerMessage,
    chain_id: &ChainId,
    block_height: u64,
) -> Vec<FunctionCallInfo> {
    let build_function_call_info_vector = streamer_message
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
            build_registry_info(indexer_rule, receipt_execution_outcome, chain_id, block_height)
        });

    build_function_call_info_vector.flatten().collect()
}

#[derive(BorshDeserialize, Debug)]
pub struct FunctionCallInfo {
    pub chain_id: ChainId,
    pub indexer_rule_id: u32,
    pub indexer_rule_name: String,
    pub signer_id: String,
    pub method_name: String,
    pub args: String,
    pub block_height: u64,
}

fn build_registry_info(
    indexer_rule: &IndexerRule,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    chain_id: &ChainId,
    block_height: u64,
) -> Vec<FunctionCallInfo> {
    if let ReceiptEnumView::Action {
        actions, signer_id, ..
    } = &receipt_execution_outcome.receipt.receipt
    {
        actions
            .iter()
            .filter(|action| {
                if let ActionView::FunctionCall { method_name, .. } = action {
                    method_name.eq(method_name)
                } else {
                    false
                }
            })
            .flat_map(|action| {
                if let ActionView::FunctionCall {
                    method_name, args, ..
                } = action
                {
                    match std::str::from_utf8(args) {
                        Ok(args) => {
                            Some(FunctionCallInfo {
                                chain_id: chain_id.clone(),
                                indexer_rule_id: indexer_rule.id.unwrap_or(0),
                                indexer_rule_name: indexer_rule.name.clone().unwrap_or("".to_string()),
                                signer_id: signer_id.to_string(),
                                method_name: method_name.to_string(),
                                args: args.to_string(),
                                block_height,
                            })
                        }
                        Err(_) => {
                            tracing::error!("Failed to deserialize args");
                            None
                        },
                    }
                } else {
                    None
                }
            })
            .collect()
    } else {
        panic!("Not an action receipt")
    }
}
