use std::collections::HashMap;

#[cfg(feature = "near-sdk")]
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
#[cfg(feature = "near-sdk")]
use near_sdk::serde::{Deserialize, Serialize};
#[cfg(feature = "near-sdk")]
use near_sdk::AccountId;

#[cfg(not(feature = "near-sdk"))]
use borsh::{BorshDeserialize, BorshSerialize};
#[cfg(not(feature = "near-sdk"))]
use near_primitives::types::AccountId;
#[cfg(not(feature = "near-sdk"))]
use serde::{Deserialize, Serialize};

type FunctionName = String;

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

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
pub enum IndexerRuleKind {
    Action,
    Event,
    AnyBlock,
    Shard,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
pub struct IndexerRule {
    pub indexer_rule_kind: IndexerRuleKind,
    pub matching_rule: MatchingRule,
    pub id: Option<u32>,
    pub name: Option<String>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct IndexerConfig {
    pub code: String,
    pub start_block_height: Option<u64>,
    pub schema: Option<String>,
    pub filter: IndexerRule,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum AccountOrAllIndexers {
    All(HashMap<AccountId, HashMap<FunctionName, IndexerConfig>>),
    Account(HashMap<FunctionName, IndexerConfig>),
}
