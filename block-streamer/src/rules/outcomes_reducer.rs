use crate::rules::matcher;
use crate::rules::types::Event;
use crate::rules::types::{ChainId, IndexerRuleMatch, IndexerRuleMatchPayload};
use crate::rules::{IndexerRule, MatchingRule};
use near_lake_framework::near_indexer_primitives::{
    IndexerExecutionOutcomeWithReceipt, StreamerMessage,
};

pub fn reduce_indexer_rule_matches_from_outcomes(
    indexer_rule: &IndexerRule,
    streamer_message: &StreamerMessage,
    chain_id: ChainId,
) -> Vec<IndexerRuleMatch> {
    streamer_message
        .shards
        .iter()
        .flat_map(|shard| {
            shard
                .receipt_execution_outcomes
                .iter()
                // future: when extracting Actions, Events, etc this will be a filter operation
                .find(|receipt_execution_outcome| {
                    matcher::matches(&indexer_rule.matching_rule, receipt_execution_outcome)
                })
        })
        .map(|receipt_execution_outcome| {
            build_indexer_rule_match(
                indexer_rule,
                receipt_execution_outcome,
                streamer_message.block.header.hash.to_string(),
                streamer_message.block.header.height,
                chain_id.clone(),
            )
        })
        .collect()
}

fn build_indexer_rule_match(
    indexer_rule: &IndexerRule,
    receipt_execution_outcome: &IndexerExecutionOutcomeWithReceipt,
    block_header_hash: String,
    block_height: u64,
    chain_id: ChainId,
) -> IndexerRuleMatch {
    IndexerRuleMatch {
        chain_id,
        indexer_rule_id: indexer_rule.id,
        indexer_rule_name: indexer_rule.name.clone(),
        payload: build_indexer_rule_match_payload(
            indexer_rule,
            receipt_execution_outcome,
            block_header_hash,
        ),
        block_height,
    }
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
        MatchingRule::ActionAny { .. } | MatchingRule::ActionFunctionCall { .. } => {
            IndexerRuleMatchPayload::Actions {
                block_hash: block_header_hash,
                receipt_id: receipt_execution_outcome.receipt.receipt_id.to_string(),
                transaction_hash,
            }
        }
        MatchingRule::Event {
            event,
            standard,
            version,
            ..
        } => {
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
                block_hash: block_header_hash,
                receipt_id: receipt_execution_outcome.receipt.receipt_id.to_string(),
                transaction_hash,
                event: event.event.clone(),
                standard: event.standard.clone(),
                version: event.version.clone(),
                data: event.data.as_ref().map(|data| data.to_string()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::rules::outcomes_reducer::reduce_indexer_rule_matches_from_outcomes;
    use crate::rules::types::{ChainId, IndexerRuleMatch};
    use crate::rules::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

    #[tokio::test]
    async fn match_wildcard_no_match() {
        let wildcard_rule = IndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule: MatchingRule::ActionAny {
                affected_account_id: "*.nearcrow.near".to_string(),
                status: Status::Success,
            },
            id: None,
            name: None,
        };

        let streamer_message = crate::test_utils::get_streamer_message(93085141);
        let result: Vec<IndexerRuleMatch> = reduce_indexer_rule_matches_from_outcomes(
            &wildcard_rule,
            &streamer_message,
            ChainId::Testnet,
        );

        assert_eq!(result.len(), 0);
    }

    #[tokio::test]
    async fn match_wildcard_contract_subaccount_name() {
        let wildcard_rule = IndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule: MatchingRule::ActionAny {
                affected_account_id: "*.nearcrowd.near".to_string(),
                status: Status::Success,
            },
            id: None,
            name: None,
        };

        let streamer_message = crate::test_utils::get_streamer_message(93085141);
        let result: Vec<IndexerRuleMatch> = reduce_indexer_rule_matches_from_outcomes(
            &wildcard_rule,
            &streamer_message,
            ChainId::Testnet,
        );

        assert_eq!(result.len(), 1); // There are two matches, until we add Extraction we are just matching the first one (block matching)
    }

    #[tokio::test]
    async fn match_wildcard_mid_contract_name() {
        let wildcard_rule = IndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule: MatchingRule::ActionAny {
                affected_account_id: "*crowd.near".to_string(),
                status: Status::Success,
            },
            id: None,
            name: None,
        };

        let streamer_message = crate::test_utils::get_streamer_message(93085141);
        let result: Vec<IndexerRuleMatch> = reduce_indexer_rule_matches_from_outcomes(
            &wildcard_rule,
            &streamer_message,
            ChainId::Testnet,
        );

        assert_eq!(result.len(), 1); // see Extraction note in previous test

        let wildcard_rule = IndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule: MatchingRule::ActionAny {
                affected_account_id: "app.nea*owd.near".to_string(),
                status: Status::Success,
            },
            id: None,
            name: None,
        };

        let result: Vec<IndexerRuleMatch> = reduce_indexer_rule_matches_from_outcomes(
            &wildcard_rule,
            &streamer_message,
            ChainId::Testnet,
        );

        assert_eq!(result.len(), 1); // see Extraction note in previous test
    }

    #[tokio::test]
    async fn match_csv_account() {
        let wildcard_rule = IndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule: MatchingRule::ActionAny {
                affected_account_id: "notintheblockaccount.near, app.nearcrowd.near".to_string(),
                status: Status::Success,
            },
            id: None,
            name: None,
        };

        let streamer_message = crate::test_utils::get_streamer_message(93085141);
        let result: Vec<IndexerRuleMatch> = reduce_indexer_rule_matches_from_outcomes(
            &wildcard_rule,
            &streamer_message,
            ChainId::Testnet,
        );

        assert_eq!(result.len(), 1); // There are two matches, until we add Extraction we are just matching the first one (block matching)
    }

    #[tokio::test]
    async fn match_csv_wildcard_account() {
        let wildcard_rule = IndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule: MatchingRule::ActionAny {
                affected_account_id: "notintheblockaccount.near, *.nearcrowd.near".to_string(),
                status: Status::Success,
            },
            id: None,
            name: None,
        };

        let streamer_message = crate::test_utils::get_streamer_message(93085141);
        let result: Vec<IndexerRuleMatch> = reduce_indexer_rule_matches_from_outcomes(
            &wildcard_rule,
            &streamer_message,
            ChainId::Testnet,
        );

        assert_eq!(result.len(), 1); // There are two matches, until we add Extraction we are just matching the first one (block matching)
    }
}
