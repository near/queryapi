pub mod matcher;
pub mod outcomes_reducer;
pub mod types;

use near_lake_framework::near_indexer_primitives::StreamerMessage;
use registry_types::Rule;

use types::{ChainId, IndexerRuleMatch};

pub fn reduce_indexer_rule_matches(
    indexer_rule: &Rule,
    streamer_message: &StreamerMessage,
    chain_id: ChainId,
) -> Vec<IndexerRuleMatch> {
    match &indexer_rule {
        Rule::ActionAny { .. } | Rule::ActionFunctionCall { .. } | Rule::Event { .. } => {
            outcomes_reducer::reduce_indexer_rule_matches_from_outcomes(
                indexer_rule,
                streamer_message,
                chain_id,
            )
        }
    }
}
