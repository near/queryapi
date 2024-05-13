use near_primitives::types::AccountId;
use registry_types::{Rule, StartBlock};

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
    pub fn get_full_name(&self) -> String {
        format!("{}/{}", self.account_id, self.function_name)
    }

    pub fn get_redis_stream_key(&self) -> String {
        format!("{}:block_stream", self.get_full_name())
    }

    pub fn get_last_published_block_key(&self) -> String {
        format!("{}:last_published_block", self.get_full_name())
    }

    pub fn get_redis_stream_version_key(&self) -> String {
        format!("{}:version", self.get_redis_stream_key())
    }

    pub fn get_state_key(&self) -> String {
        format!("{}:state", self.get_full_name())
    }

    pub fn get_registry_version(&self) -> u64 {
        self.updated_at_block_height
            .unwrap_or(self.created_at_block_height)
    }
}
