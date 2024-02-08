use near_primitives::types::AccountId;
use registry_types::{Rule, StartBlock};

#[derive(Debug, Clone)]
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

    pub fn get_redis_stream(&self /*, version: u64*/) -> String {
        format!("{}:block_stream", self.get_full_name())
    }

    pub fn get_historical_redis_stream(&self) -> String {
        format!("{}:historical:stream", self.get_full_name())
    }

    pub fn get_real_time_redis_stream(&self) -> String {
        format!("{}:real_time:stream", self.get_full_name())
    }

    pub fn get_last_published_block(&self) -> String {
        format!("{}:last_published_block", self.get_full_name())
    }

    pub fn get_redis_stream_version(&self) -> String {
        format!("{}:version", self.get_redis_stream())
    }
}
