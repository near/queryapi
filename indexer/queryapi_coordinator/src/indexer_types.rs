use indexer_rules_engine::types::indexer_rule::IndexerRule;
use indexer_rules_engine::types::indexer_rule_match::{ChainId, IndexerRuleMatchPayload};
use near_lake_framework::near_indexer_primitives::types::AccountId;
use std::collections::HashMap;

pub type IndexerRegistry = HashMap<AccountId, HashMap<String, IndexerFunction>>;

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub struct IndexerQueueMessage {
    pub chain_id: ChainId,
    pub indexer_rule_id: u32,
    pub indexer_rule_name: String,
    pub payload: Option<IndexerRuleMatchPayload>,
    pub block_height: u64,
    pub indexer_function: IndexerFunction,
}

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub struct IndexerFunction {
    pub account_id: AccountId,
    pub function_name: String,
    pub code: String,
    pub start_block_height: Option<u64>,
    pub schema: Option<String>,
    pub provisioned: bool,
    pub indexer_rule: IndexerRule,
}
