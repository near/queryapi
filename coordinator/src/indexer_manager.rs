use std::cmp::Ordering;
use std::collections::HashMap;

use near_primitives::types::AccountId;

use crate::indexer_config::IndexerConfig;

#[derive(Debug, PartialEq, Eq)]
pub enum SyncStatus {
    /// Stream version is synchronized with the registry
    Synced,
    /// Stream version does not match registry
    Outdated,
    /// No stream version, therefore new
    New,
}

// default if not exist?
#[derive(Default, Clone)]
pub struct IndexerState {
    pub synced_at: Option<u64>,
    // merge in indexer config so don't need to pass in?
}

impl IndexerState {
    pub fn get_sync_status(&self, indexer_config: &IndexerConfig) -> SyncStatus {
        if self.synced_at.is_none() {
            return SyncStatus::New;
        }

        match indexer_config
            .get_registry_version()
            .cmp(&self.synced_at.unwrap())
        {
            Ordering::Equal => SyncStatus::Synced,
            Ordering::Greater => SyncStatus::Outdated,
            Ordering::Less => {
                tracing::warn!(
                    "Found stream with version greater than registry, treating as outdated"
                );

                SyncStatus::Outdated
            }
        }
    }
}

type FunctionName = String;

type IndexerStates = HashMap<(AccountId, FunctionName), IndexerState>;

// binary semaphore to protect updating redis simultaneously
// or wrap redis in a mutex
#[cfg(not(test))]
pub use IndexerManagerImpl as IndexerManager;
#[cfg(test)]
pub use MockIndexerManagerImpl as IndexerManager;

pub struct IndexerManagerImpl;

// IndexerStateManager?
#[cfg_attr(test, mockall::automock)]
impl IndexerManagerImpl {
    pub fn new() -> Self {
        Self
    }

    pub fn get_state(&self, indexer_config: &IndexerConfig) -> IndexerState {
        Default::default()
    }
}
