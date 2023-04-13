use std::collections::HashMap;
use near_lake_framework::near_indexer_primitives::types::AccountId;
use crate::ChainId;
use crate::primitives::AlertQueueMessagePayload;

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
    pub alert_rule_id: i32,
    pub alert_name: String,
    pub payload: Option<AlertQueueMessagePayload>,
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
    //pub alert_rule: AlertRule, // future
}