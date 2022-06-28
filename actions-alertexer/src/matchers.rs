use alert_rules::{AlertRule, MatchingRule, Status};
use near_lake_framework::near_indexer_primitives::{
    views::ExecutionStatusView, IndexerExecutionOutcomeWithReceipt,
};

pub trait Matcher {
    fn matches(&self, outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt) -> bool;
}

impl Matcher for AlertRule {
    fn matches(&self, outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt) -> bool {
        self.matching_rule().matches(outcome_with_receipt)
    }
}

impl Matcher for MatchingRule {
    fn matches(&self, outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt) -> bool {
        match self {
            MatchingRule::ActionAny {
                affected_account_id,
                status,
            } => match_action_any(affected_account_id, status, outcome_with_receipt),
            &MatchingRule::ActionTransfer { .. } => {
                tracing::warn!(
                    target: crate::INDEXER,
                    "ActionTransfer matcher is not implemented"
                );
                false
            }
            &MatchingRule::ActionFunctionCall { .. } => {
                tracing::warn!(
                    target: crate::INDEXER,
                    "ActionFunctionCall matcher is not implemented"
                );
                false
            }
        }
    }
}

fn match_action_any(
    account_id: &String,
    status: &Status,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    if &outcome_with_receipt.receipt.receiver_id.to_string() == account_id
        || &outcome_with_receipt.receipt.predecessor_id.to_string() == account_id
    {
        match status {
            Status::Any => return true,
            Status::Success => match outcome_with_receipt.execution_outcome.outcome.status {
                ExecutionStatusView::SuccessValue(_) | ExecutionStatusView::SuccessReceiptId(_) => {
                    return true
                }
                _ => return false,
            },
            Status::Fail => match outcome_with_receipt.execution_outcome.outcome.status {
                ExecutionStatusView::SuccessValue(_) | ExecutionStatusView::SuccessReceiptId(_) => {
                    return false
                }
                _ => return true,
            },
        }
    }
    false
}
