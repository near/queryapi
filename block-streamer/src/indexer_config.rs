use near_lake_framework::near_indexer_primitives::types::AccountId;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use registry_types::OldIndexerRule as IndexerRule;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IndexerConfig {
    pub account_id: AccountId,
    pub function_name: String,
    // pub code: String,
    // pub start_block_height: Option<u64>,
    // pub schema: Option<String>,
    // pub provisioned: bool,
    pub indexer_rule: IndexerRule,
}

impl IndexerConfig {
    pub fn get_full_name(&self) -> String {
        format!("{}/{}", self.account_id, self.function_name)
    }

    pub fn get_hash_id(&self) -> String {
        let mut hasher = DefaultHasher::new();
        self.get_full_name().hash(&mut hasher);
        hasher.finish().to_string()
    }
}
