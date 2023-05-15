#[cfg(not(feature = "near-sdk"))]
use serde::{Deserialize, Serialize};
#[cfg(not(feature = "near-sdk"))]
use borsh::{self, BorshDeserialize, BorshSerialize};

#[cfg(feature = "near-sdk")]
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
#[cfg(feature = "near-sdk")]
use near_sdk::serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
pub struct IndexerRule {
    pub indexer_rule_kind: IndexerRuleKind,
    pub matching_rule: MatchingRule,
    pub id: Option<u32>,
    pub name: Option<String>,
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
}