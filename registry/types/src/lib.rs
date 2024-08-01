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
pub struct OldIndexerConfig {
    pub code: String,
    pub start_block: StartBlock,
    pub schema: String,
    pub rule: Rule,
    pub updated_at_block_height: Option<u64>,
    pub created_at_block_height: u64,
    pub forked_from: Option<IndexerIdentity>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct IndexerConfig {
    pub code: String,
    pub start_block: StartBlock,
    pub schema: String,
    pub rule: Rule,
    pub updated_at_block_height: Option<u64>,
    pub created_at_block_height: u64,
    pub deleted_at_block_height: Option<u64>,
    pub forked_from: Option<IndexerIdentity>,
}

impl From<OldIndexerConfig> for IndexerConfig {
    fn from(config: OldIndexerConfig) -> Self {
        Self {
            start_block: config.start_block,
            schema: config.schema,
            code: config.code,
            rule: config.rule,
            created_at_block_height: config.created_at_block_height,
            updated_at_block_height: config.updated_at_block_height,
            deleted_at_block_height: None,
            forked_from: config.forked_from,
        }
    }
}

pub type AccountIndexers = HashMap<FunctionName, IndexerConfig>;

pub type AllIndexers = HashMap<AccountId, AccountIndexers>;

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum AccountOrAllIndexers {
    AccountIndexers(HashMap<FunctionName, IndexerConfig>),
    AllIndexers(HashMap<AccountId, AccountIndexers>),
}
