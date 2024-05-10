use near_primitives::types::AccountId;
use registry_types::{Rule, StartBlock};

use crate::redis::RedisKeyProvider;

#[derive(Debug, Clone, PartialEq)]
pub struct IndexerConfig {
    pub account_id: AccountId,
    pub function_name: String,
    pub code: String,
    pub start_block: StartBlock,
    pub schema: String,
    pub rule: Rule,
    pub updated_at_block_height: Option<u64>,
    pub created_at_block_height: u64,
}

impl IndexerConfig {
    pub fn get_registry_version(&self) -> u64 {
        self.updated_at_block_height
            .unwrap_or(self.created_at_block_height)
    }
}

impl RedisKeyProvider for IndexerConfig {
    fn prefix(&self) -> String {
        format!("{}/{}", self.account_id, self.function_name)
    }
}
