use alert_rules::{Comparator, MatchingRule};
use near_lake_framework::near_indexer_primitives::views::{
    StateChangeValueView, StateChangeWithCauseView,
};

pub(crate) async fn match_state_change_account_balance(
    matching_rule: &MatchingRule,
    state_change: &StateChangeWithCauseView,
    context: &crate::AlertexerContext<'_>,
) -> bool {
    if let MatchingRule::StateChangeAccountBalance {
        affected_account_id,
        comparator,
    } = matching_rule
    {
        // Only `AccountView` struct exposes the amount so we ignore any other state changes
        // except `AccountDeletion` in this case new balances are 0
        match &state_change.value {
            StateChangeValueView::AccountUpdate {
                account_id,
                account,
            } => {
                if wildmatch::WildMatch::new(affected_account_id).matches(account_id) {
                    let prev_account_balance = match crate::cache::get_balance_retriable(
                        account_id,
                        &context.streamer_message.block.header.prev_hash.to_string(),
                        context.balance_cache,
                        context.json_rpc_client,
                    )
                    .await
                    {
                        Ok(res) => {
                            crate::cache::save_latest_balance(
                                account_id.clone(),
                                &crate::BalanceDetails {
                                    staked: account.locked,
                                    non_staked: account.amount.saturating_sub(account.locked),
                                },
                                context.balance_cache,
                            )
                            .await;
                            res.non_staked + res.staked
                        }
                        Err(err) => {
                            tracing::error!(
                                target: crate::INDEXER,
                                "Failed to get previous account balance, ignoring. \n{:#?}",
                                err,
                            );
                            return false;
                        }
                    };
                    match comparator {
                        Comparator::RelativePercentageAmount { from, to } => {
                            let range_start = if let Some(from) = from {
                                from.0
                            } else {
                                u128::MAX
                            };
                            let range_end = if let Some(to) = to { to.0 } else { u128::MAX };

                            let balance_diff = account.amount.abs_diff(prev_account_balance);

                            let balance_diff_in_percent = balance_diff / (account.amount / 100);

                            (range_start..range_end).contains(&balance_diff_in_percent)
                        }
                        Comparator::RelativeYoctonearAmount { from, to } => {
                            let range_start = if let Some(from) = from {
                                from.0
                            } else {
                                u128::MAX
                            };
                            let range_end = if let Some(to) = to { to.0 } else { u128::MAX };

                            let balance_diff = account.amount.abs_diff(prev_account_balance);
                            (range_start..range_end).contains(&balance_diff)
                        }
                    }
                } else {
                    false
                }
            }
            StateChangeValueView::AccountDeletion { account_id } => {
                if wildmatch::WildMatch::new(affected_account_id).matches(account_id) {
                    let prev_account_balance = match crate::cache::get_balance_retriable(
                        account_id,
                        &context.streamer_message.block.header.prev_hash.to_string(),
                        context.balance_cache,
                        context.json_rpc_client,
                    )
                    .await
                    {
                        Ok(res) => {
                            crate::cache::save_latest_balance(
                                account_id.clone(),
                                &crate::BalanceDetails {
                                    staked: 0,
                                    non_staked: 0,
                                },
                                context.balance_cache,
                            )
                            .await;
                            res.non_staked + res.staked
                        }
                        Err(err) => {
                            tracing::error!(
                                target: crate::INDEXER,
                                "Failed to get previous account balance, ignoring. \n{:#?}",
                                err,
                            );
                            return false;
                        }
                    };

                    match comparator {
                        Comparator::RelativePercentageAmount { from, to } => {
                            let range_start = if let Some(from) = from {
                                from.0
                            } else {
                                u128::MAX
                            };
                            let range_end = if let Some(to) = to { to.0 } else { u128::MAX };

                            let balance_diff_in_percent = 100u128;

                            (range_start..range_end).contains(&balance_diff_in_percent)
                        }
                        Comparator::RelativeYoctonearAmount { from, to } => {
                            let range_start = if let Some(from) = from {
                                from.0
                            } else {
                                u128::MAX
                            };
                            let range_end = if let Some(to) = to { to.0 } else { u128::MAX };

                            let balance_diff = 0u128.abs_diff(prev_account_balance);
                            (range_start..range_end).contains(&balance_diff)
                        }
                    }
                } else {
                    false
                }
            }
            _ => false,
        }
    } else {
        false
    }
}
