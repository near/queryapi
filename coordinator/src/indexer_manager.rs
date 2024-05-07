use std::cmp::Ordering;
use std::collections::HashMap;

use near_primitives::types::AccountId;

use crate::indexer_config::IndexerConfig;

#[derive(Debug, PartialEq, Eq)]
pub enum SyncStatus {
    Synced,
    Outdated,
    New,
}

// default if not exist?
#[derive(Default, Clone)]
pub struct IndexerState {
    pub synced_at: Option<u64>,
}

type FunctionName = String;

type IndexerStates = HashMap<(AccountId, FunctionName), IndexerState>;

#[cfg(not(test))]
pub use IndexerManagerImpl as IndexerManager;
#[cfg(test)]
pub use MockIndexerManagerImpl as IndexerManager;

// binary semaphore to protect updating redis simultaneously
// or wrap redis in a mutex
pub struct IndexerManagerImpl;

// IndexerStateManager?
// StateManager?
#[cfg_attr(test, mockall::automock)]
impl IndexerManagerImpl {
    pub fn new() -> Self {
        Self
    }

    pub fn get_sync_status(&self, indexer_config: &IndexerConfig) -> SyncStatus {
        SyncStatus::Synced
    }
}
