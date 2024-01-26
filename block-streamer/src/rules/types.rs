use std::fmt;

pub type TransactionHashString = String;
pub type ReceiptIdString = String;
pub type BlockHashString = String;

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub struct IndexerRuleMatch {
    pub chain_id: ChainId,
    pub indexer_rule_id: Option<u32>,
    pub indexer_rule_name: Option<String>,
    pub payload: IndexerRuleMatchPayload,
    pub block_height: u64,
}

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub enum IndexerRuleMatchPayload {
    Actions {
        block_hash: BlockHashString,
        receipt_id: ReceiptIdString,
        transaction_hash: Option<TransactionHashString>,
    },
    Events {
        block_hash: BlockHashString,
        receipt_id: ReceiptIdString,
        transaction_hash: Option<TransactionHashString>,
        event: String,
        standard: String,
        version: String,
        data: Option<String>,
    },
    StateChanges {
        block_hash: BlockHashString,
        receipt_id: Option<ReceiptIdString>,
        transaction_hash: Option<TransactionHashString>,
    },
}

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub enum ChainId {
    Mainnet,
    Testnet,
}
impl fmt::Display for ChainId {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ChainId::Mainnet => write!(f, "mainnet"),
            ChainId::Testnet => write!(f, "testnet"),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Event {
    pub event: String,
    pub standard: String,
    pub version: String,
    pub data: Option<serde_json::Value>,
}

impl Event {
    pub fn from_log(log: &str) -> anyhow::Result<Self> {
        let prefix = "EVENT_JSON:";
        if !log.starts_with(prefix) {
            anyhow::bail!("log message doesn't start from required prefix");
        }

        Ok(serde_json::from_str::<'_, Self>(
            log[prefix.len()..].trim(),
        )?)
    }
}
