use std::collections::HashMap;

use near_account_id::AccountId;

#[cfg(feature = "near-sdk")]
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
#[cfg(feature = "near-sdk")]
use near_sdk::serde::{Deserialize, Serialize};

#[cfg(not(feature = "near-sdk"))]
use borsh::{BorshDeserialize, BorshSerialize};
#[cfg(not(feature = "near-sdk"))]
use serde::{Deserialize, Serialize};

type FunctionName = String;

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

impl From<Rule> for MatchingRule {
    fn from(value: Rule) -> Self {
        match value {
            Rule::ActionAny {
                affected_account_id,
                status,
            } => MatchingRule::ActionAny {
                affected_account_id,
                status,
            },
            Rule::Event {
                contract_account_id,
                standard,
                version,
                event,
            } => MatchingRule::Event {
                contract_account_id,
                standard,
                version,
                event,
            },
            Rule::ActionFunctionCall {
                affected_account_id,
                status,
                function,
            } => MatchingRule::ActionFunctionCall {
                affected_account_id,
                status,
                function,
            },
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
pub enum IndexerRuleKind {
    Action,
    Event,
    AnyBlock,
    Shard,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
pub struct OldIndexerRule {
    pub indexer_rule_kind: IndexerRuleKind,
    pub matching_rule: MatchingRule,
    // These are not set, and not used anywhere
    pub id: Option<u32>,
    pub name: Option<String>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct OldIndexerConfig {
    pub code: String,
    pub start_block_height: Option<u64>,
    pub schema: Option<String>,
    pub filter: OldIndexerRule,
    pub updated_at_block_height: Option<u64>,
    pub created_at_block_height: u64,
}

impl From<IndexerConfig> for OldIndexerConfig {
    fn from(config: IndexerConfig) -> Self {
        let start_block_height = match config.start_block {
            StartBlock::Latest => None,
            StartBlock::Continue => None,
            StartBlock::Height(height) => Some(height),
        };

        let schema = if config.schema.is_empty() {
            None
        } else {
            Some(config.schema)
        };

        OldIndexerConfig {
            start_block_height,
            schema,
            code: config.code,
            filter: OldIndexerRule {
                indexer_rule_kind: IndexerRuleKind::Action,
                matching_rule: config.rule.into(),
                id: None,
                name: None,
            },
            created_at_block_height: config.created_at_block_height,
            updated_at_block_height: config.updated_at_block_height,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum OldAccountOrAllIndexers {
    All(HashMap<AccountId, HashMap<FunctionName, OldIndexerConfig>>),
    Account(HashMap<FunctionName, OldIndexerConfig>),
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Status {
    Any,
    Success,
    Fail,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Rule {
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

impl From<MatchingRule> for Rule {
    fn from(value: MatchingRule) -> Self {
        match value {
            MatchingRule::ActionAny {
                affected_account_id,
                status,
            } => Rule::ActionAny {
                affected_account_id,
                status,
            },
            MatchingRule::Event {
                contract_account_id,
                standard,
                version,
                event,
            } => Rule::Event {
                contract_account_id,
                standard,
                version,
                event,
            },
            MatchingRule::ActionFunctionCall {
                affected_account_id,
                status,
                function,
            } => Rule::ActionFunctionCall {
                affected_account_id,
                status,
                function,
            },
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StartBlock {
    /// Specifies the particular block height from which to start indexing from.
    Height(u64),
    /// Starts indexing from the most recently finalized block.
    Latest,
    /// Resumes indexing from the block immediately following the last one successfully indexed
    /// prior to update.
    Continue,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct IndexerIdentity {
    pub account_id: AccountId,
    pub function_name: FunctionName,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct IndexerConfig {
    pub code: String,
    pub start_block: StartBlock,
    pub schema: String,
    pub rule: Rule,
    pub updated_at_block_height: Option<u64>,
    pub created_at_block_height: u64,
    pub forked_from: Option<IndexerIdentity>,
}

impl From<OldIndexerConfig> for IndexerConfig {
    fn from(config: OldIndexerConfig) -> Self {
        Self {
            start_block: match config.start_block_height {
                Some(height) => StartBlock::Height(height),
                None => StartBlock::Latest,
            },
            schema: config.schema.unwrap_or(String::new()),
            code: config.code,
            rule: config.filter.matching_rule.into(),
            created_at_block_height: config.created_at_block_height,
            updated_at_block_height: config.updated_at_block_height,
            forked_from: None,
        }
    }
}

pub type AccountIndexers = HashMap<FunctionName, IndexerConfig>;

pub type AllIndexers = HashMap<AccountId, AccountIndexers>;
