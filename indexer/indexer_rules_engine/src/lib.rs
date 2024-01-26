pub mod matcher;
pub mod outcomes_reducer;
pub mod types;

use indexer_rule_type::indexer_rule::{IndexerRule, MatchingRule};
use near_lake_framework::near_indexer_primitives::StreamerMessage;
use types::indexer_rule_match::{ChainId, IndexerRuleMatch};

pub fn reduce_indexer_rule_matches(
    indexer_rule: &IndexerRule,
    streamer_message: &StreamerMessage,
    chain_id: ChainId,
) -> Vec<IndexerRuleMatch> {
    match &indexer_rule.matching_rule {
        MatchingRule::ActionAny { .. }
        | MatchingRule::ActionFunctionCall { .. }
        | MatchingRule::Event { .. } => {
            outcomes_reducer::reduce_indexer_rule_matches_from_outcomes(
                indexer_rule,
                streamer_message,
                chain_id,
            )
        }
    }
}
