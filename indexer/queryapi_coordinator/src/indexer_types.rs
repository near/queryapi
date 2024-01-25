use indexer_rule_type::indexer_rule::IndexerRule;
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
pub struct IndexerFunction {
    pub account_id: AccountId,
    pub function_name: String,
    pub code: String,
    pub start_block_height: Option<u64>,
    pub schema: Option<String>,
    pub provisioned: bool,
    pub indexer_rule: IndexerRule,
}

impl IndexerFunction {
    pub fn get_full_name(&self) -> String {
        format!("{}/{}", self.account_id, self.function_name)
    }
}
