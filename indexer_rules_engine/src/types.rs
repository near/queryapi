use serde::{Deserialize, Serialize};
use borsh::{BorshDeserialize, BorshSerialize};

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
pub struct IndexerRule {
    pub indexer_rule_kind: IndexerRuleKind,
    pub matching_rule: MatchingRule,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
pub enum IndexerRuleKind {
    Action,
    Event,
    AnyBlock,
    Shard,
}
// future: ComposedRuleKind for multiple actions or events

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Status {
    Any,
    Success,
    Fail,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
#[serde(tag = "rule", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MatchingRule {
    ActionAny {
        affected_account_id: String,
        status: Status,
    },
    // ActionTransfer {
    //     affected_account_id: String,
    //     status: Status,
    //     amount: DepositAmountCondition,
    // },
    ActionFunctionCall {
        affected_account_id: String,
        status: Status,
        function: String,
    },
    Event {
        contract_account_id: String,
        standard: String,
        version: String,
        event: String,
    },
    // StateChangeAccountBalance {
    //     affected_account_id: String,
    //     #[serde(flatten)]
    //     comparator: Comparator,
    // },
}