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
pub struct AlertQueueMessage {
    pub chain_id: ChainId,
    pub alert_rule_id: i32,
    pub payload: AlertQueueMessagePayload,
}

impl AlertQueueMessage {
    pub fn explorer_link(&self) -> String {
        match self.chain_id {
            ChainId::Testnet => {
                if let Some(tx_hash) = self.payload.transaction_hash() {
                    if let Some(receipt_id) = self.payload.receipt_id() {
                        return format!(
                            "https://explorer.testnet.near.org/transactions/{}#{}",
                            tx_hash, receipt_id,
                        );
                    } else {
                        return format!(
                            "https://explorer.testnet.near.org/transactions/{}",
                            tx_hash
                        );
                    }
                } else {
                    return format!(
                        "https://explorer.testnet.near.org/block/{}",
                        self.payload.block_hash()
                    );
                }
            }
            ChainId::Mainnet => {
                if let Some(tx_hash) = self.payload.transaction_hash() {
                    if let Some(receipt_id) = self.payload.receipt_id() {
                        return format!(
                            "https://explorer.near.org/transactions/{}#{}",
                            tx_hash, receipt_id,
                        );
                    } else {
                        return format!("https://explorer.near.org/transactions/{}", tx_hash);
                    }
                } else {
                    return format!(
                        "https://explorer.near.org/block/{}",
                        self.payload.block_hash()
                    );
                }
            }
        }
    }
}

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub enum AlertQueueMessagePayload {
    Actions {
        block_hash: BlockHashString,
        receipt_id: ReceiptIdString,
        transaction_hash: TransactionHashString,
    },
    Events {
        block_hash: BlockHashString,
        receipt_id: ReceiptIdString,
        transaction_hash: TransactionHashString,
    },
    StateChanges {
        block_hash: BlockHashString,
        receipt_id: Option<ReceiptIdString>,
        transaction_hash: TransactionHashString,
    },
}

impl AlertQueueMessagePayload {
    pub fn block_hash(&self) -> BlockHashString {
        match self {
            Self::Actions { block_hash, .. }
            | Self::Events { block_hash, .. }
            | Self::StateChanges { block_hash, .. } => block_hash.to_string(),
        }
    }

    pub fn receipt_id(&self) -> Option<ReceiptIdString> {
        match self {
            Self::Actions { receipt_id, .. } | Self::Events { receipt_id, .. } => {
                Some(receipt_id.to_string())
            }
            Self::StateChanges { receipt_id, .. } => receipt_id.clone(),
        }
    }

    pub fn transaction_hash(&self) -> Option<TransactionHashString> {
        match self {
            Self::Actions {
                transaction_hash, ..
            }
            | Self::Events {
                transaction_hash, ..
            }
            | Self::StateChanges {
                transaction_hash, ..
            } => Some(transaction_hash.to_string()),
        }
    }
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

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub struct AlertDeliveryTask {
    pub triggered_alert_id: i32,
    pub destination_config: DestinationConfig,
    pub alert_message: AlertQueueMessage,
}

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub enum DestinationConfig {
    Webhook {
        destination_id: i32,
        url: String,
        secret: String,
    },
    Telegram {
        destination_id: i32,
        chat_id: f64,
    },
}
