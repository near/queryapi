use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct TxAlertRule {
    pub account_id: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ReceiptAccountPartyAlertRule {
    pub account_id: String,
}
