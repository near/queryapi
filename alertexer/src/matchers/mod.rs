use alert_rules::{AlertRule, MatchingRule, Status};
use near_lake_framework::near_indexer_primitives::{
    views::ExecutionStatusView, IndexerExecutionOutcomeWithReceipt,
};

mod actions;
mod events;

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
            } => actions::match_action_any(affected_account_id, status, outcome_with_receipt),
            &MatchingRule::ActionTransfer { .. } => {
                tracing::debug!(
                    target: crate::INDEXER,
                    "ActionTransfer matcher is not implemented"
                );
                false
            }
            MatchingRule::ActionFunctionCall {
                affected_account_id,
                status,
                function,
            } => actions::match_action_function_call(
                affected_account_id,
                status,
                function,
                outcome_with_receipt,
            ),
            MatchingRule::Events {
                affected_account_id,
                event_name,
                standard,
                version,
            } => events::match_events(
                affected_account_id,
                event_name,
                standard,
                version,
                outcome_with_receipt,
            ),
        }
    }
}

fn match_account(
    account_id: &String,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    wildmatch::WildMatch::new(account_id)
        .matches(&outcome_with_receipt.receipt.receiver_id.to_string())
        || wildmatch::WildMatch::new(account_id)
            .matches(&outcome_with_receipt.receipt.predecessor_id.to_string())
}

fn match_status(status: &Status, execution_outcome_status: &ExecutionStatusView) -> bool {
    match status {
        Status::Any => return true,
        Status::Success => match execution_outcome_status {
            ExecutionStatusView::SuccessValue(_) | ExecutionStatusView::SuccessReceiptId(_) => {
                return true
            }
            _ => return false,
        },
        Status::Fail => match execution_outcome_status {
            ExecutionStatusView::SuccessValue(_) | ExecutionStatusView::SuccessReceiptId(_) => {
                return false
            }
            _ => return true,
        },
    }
}
