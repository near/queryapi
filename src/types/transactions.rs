use near_lake_framework::near_indexer_primitives::views;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct TransactionDetails {
    pub transaction: views::SignedTransactionView,
    pub receipts: Vec<views::ReceiptView>,
    pub execution_outcomes: Vec<views::ExecutionOutcomeWithIdView>,
    pub collection_status: TransactionCollectionStatus,
}

impl TransactionDetails {
    pub fn is_finished(&self) -> bool {
        matches!(self.collection_status, TransactionCollectionStatus::Finished)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) enum TransactionCollectionStatus {
    Collecting,
    Finished,
}
