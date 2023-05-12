use borsh::BorshDeserialize;

use near_lake_framework::near_indexer_primitives::views::{ActionView, ReceiptEnumView};
use near_lake_framework::near_indexer_primitives::IndexerExecutionOutcomeWithReceipt;

use alert_rules::AlertRule;

use crate::outcomes_reducer::matcher;

pub(crate) fn reduce_function_registry_from_outcomes(
    alert_rule: &AlertRule,
    context: &crate::QueryApiContext<'_>,
) -> Vec<FunctionCallInfo> {
    let build_function_call_info_vector = context
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
            build_registry_info(alert_rule, receipt_execution_outcome, context)
        });

    build_function_call_info_vector.flatten().collect()
}

#[derive(BorshDeserialize, Debug)]
pub struct FunctionCallInfo {
    pub chain_id: shared::alertexer_types::primitives::ChainId,
    pub alert_rule_id: i32,
    pub alert_name: String,
    pub signer_id: String,
    pub method_name: String,
    pub args: String,
    pub block_height: u64,
}

fn build_registry_info(
    alert_rule: &AlertRule,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    context: &crate::QueryApiContext<'_>,
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
                                chain_id: context.chain_id.clone(),
                                alert_rule_id: alert_rule.id,
                                alert_name: alert_rule.name.clone(),
                                signer_id: signer_id.to_string(),
                                method_name: method_name.to_string(),
                                args: args.to_string(),
                                block_height: context.streamer_message.block.header.height,
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
