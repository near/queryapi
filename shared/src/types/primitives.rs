pub type TransactionHashString = String;
pub type ReceiptIdString = String;

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub struct AlertQueueMessage<T: borsh::BorshSerialize + borsh::BorshDeserialize> {
    pub alert_rule_id: i32,
    pub payload: T,
}

#[derive(
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
pub struct ActionsAlertPayload {
    pub receipt_id: ReceiptIdString,
    pub transaction_hash: TransactionHashString,
}
