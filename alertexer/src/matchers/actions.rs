use alert_rules::Status;

use near_lake_framework::near_indexer_primitives::{
    views::{ActionView, ReceiptEnumView},
    IndexerExecutionOutcomeWithReceipt,
};

pub(crate) fn match_action_any(
    account_id: &String,
    status: &Status,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    if super::match_account(account_id, outcome_with_receipt) {
        return super::match_status(
            status,
            &outcome_with_receipt.execution_outcome.outcome.status,
        );
    }
    false
}

pub(crate) fn match_action_function_call(
    account_id: &String,
    status: &Status,
    function: &String,
    outcome_with_receipt: &IndexerExecutionOutcomeWithReceipt,
) -> bool {
    if super::match_account(account_id, outcome_with_receipt) {
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
                return super::match_status(
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
