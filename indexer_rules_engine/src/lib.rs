pub mod types;

use types::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

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
    }
}