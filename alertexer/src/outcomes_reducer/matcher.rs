use alert_rules::{MatchingRule, Status};

use near_lake_framework::near_indexer_primitives::{
    views::{ActionView, ExecutionStatusView, ReceiptEnumView},
    IndexerExecutionOutcomeWithReceipt,
};

use shared::types::events::Event;

pub(crate) fn matches(
    matching_rule: &MatchingRule,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    match matching_rule {
        MatchingRule::ActionAny {
            affected_account_id,
            status,
        } => match_action_any(affected_account_id, status, receipt_execution_outcome),
        MatchingRule::ActionFunctionCall {
            affected_account_id,
            status,
            function,
        } => match_action_function_call(
            affected_account_id,
            status,
            function,
            receipt_execution_outcome,
        ),
        MatchingRule::Event {
            contract_account_id,
            event,
            standard,
            version,
        } => match_event(
            contract_account_id,
            event,
            standard,
            version,
            receipt_execution_outcome,
        ),
        _ => unreachable!(
            "Unreachable code! Didn't expect StateChanges based MatchingRule in `outcomes_reducer`"
        ),
    }
}

fn match_action_any(
    account_id: &str,
    status: &Status,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    if match_account(account_id, outcome_with_receipt) {
        return match_status(
            status,
            &outcome_with_receipt.execution_outcome.outcome.status,
        );
    }
    false
}

fn match_action_function_call(
    account_id: &str,
    status: &Status,
    function: &str,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    if match_account(account_id, outcome_with_receipt) {
        if let ReceiptEnumView::Action { actions, .. } = &outcome_with_receipt.receipt.receipt {
            let function_call_actions = actions
                .iter()
                .filter_map(|action| {
                    if let ActionView::FunctionCall { method_name, .. } = action {
                        Some(method_name == function)
                    } else {
                        None
                    }
                })
                .count();
            if function_call_actions > 0 {
                return match_status(
                    status,
                    &outcome_with_receipt.execution_outcome.outcome.status,
                );
            } else {
                return false;
            }
        }
    }
    false
}

fn match_event(
    account_id: &str,
    event: &str,
    standard: &str,
    version: &str,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    if match_account(account_id, outcome_with_receipt) {
        let outcome_logs_with_triggered_events_json: Vec<Event> = outcome_with_receipt
            .execution_outcome
            .outcome
            .logs
            .iter()
            .filter_map(|log| Event::from_log(log).ok())
            .filter(|near_event| {
                vec![
                    wildmatch::WildMatch::new(event).matches(&near_event.event),
                    wildmatch::WildMatch::new(standard).matches(&near_event.standard),
                    wildmatch::WildMatch::new(version).matches(&near_event.version),
                ]
                .into_iter()
                .all(|val| val)
            })
            .collect();

        return !outcome_logs_with_triggered_events_json.is_empty();
    }
    false
}

fn match_account(
    account_id: &str,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    wildmatch::WildMatch::new(account_id).matches(&outcome_with_receipt.receipt.receiver_id)
        || wildmatch::WildMatch::new(account_id)
            .matches(&outcome_with_receipt.receipt.predecessor_id)
}

fn match_status(status: &Status, execution_outcome_status: &ExecutionStatusView) -> bool {
    match status {
        Status::Any => true,
        Status::Success => matches!(
            execution_outcome_status,
            ExecutionStatusView::SuccessValue(_) | ExecutionStatusView::SuccessReceiptId(_)
        ),
        Status::Fail => match execution_outcome_status {
            ExecutionStatusView::SuccessValue(_) | ExecutionStatusView::SuccessReceiptId(_) => {
                false
            }
            _ => true,
        },
    }
}
