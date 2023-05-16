pub mod matcher;
pub mod outcomes_reducer;
pub mod types;

use near_lake_framework::near_indexer_primitives::StreamerMessage;
use types::indexer_rule::{IndexerRule, IndexerRuleKind, MatchingRule, Status};
use types::indexer_rule_match::{ChainId, IndexerRuleMatch};

pub async fn reduce_indexer_rule_matches(
    indexer_rule: &IndexerRule,
    streamer_message: &StreamerMessage,
    chain_id: ChainId,
) -> anyhow::Result<Vec<IndexerRuleMatch>> {
    Ok(match &indexer_rule.matching_rule {
        MatchingRule::ActionAny { .. }
        | MatchingRule::ActionFunctionCall { .. }
        | MatchingRule::Event { .. } => {
            outcomes_reducer::reduce_indexer_rule_matches_from_outcomes(
                indexer_rule,
                streamer_message,
                chain_id,
            )
            .await?
        }
    })
}

pub fn near_social_indexer_rule() -> IndexerRule {
    let contract = "social.near";
    let method = "set";
    let matching_rule = MatchingRule::ActionFunctionCall {
        affected_account_id: contract.to_string(),
        function: method.to_string(),
        status: Status::Any,
    };
    IndexerRule {
        indexer_rule_kind: IndexerRuleKind::Action,
        matching_rule,
        id: None,
        name: None,
    }
}
