use std::cmp::Ordering;

use crate::indexer_config::IndexerConfig;
use crate::redis::RedisClient;

#[derive(Debug, PartialEq, Eq)]
pub enum SyncStatus {
    Synced,
    Outdated,
    New,
}

#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize)]
struct IndexerState {
    synced_at_block_height: u64,
}

#[cfg(not(test))]
pub use IndexerManagerImpl as IndexerManager;
#[cfg(test)]
pub use MockIndexerManagerImpl as IndexerManager;

// binary semaphore to protect updating redis simultaneously
// or wrap redis in a mutex
pub struct IndexerManagerImpl {
    redis_client: RedisClient,
}

// IndexerStateManager?
// StateManager?
#[cfg_attr(test, mockall::automock)]
impl IndexerManagerImpl {
    pub fn new(redis_client: RedisClient) -> Self {
        Self { redis_client }
    }

    async fn get_state(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<Option<IndexerState>> {
        let raw_state = self.redis_client.get_indexer_state(indexer_config).await?;

        raw_state
            .map(|raw_state| serde_json::from_str(&raw_state).map_err(Into::into))
            .transpose()
    }

    async fn set_state(
        &self,
        indexer_config: &IndexerConfig,
        state: IndexerState,
    ) -> anyhow::Result<()> {
        let raw_state = serde_json::to_string(&state)?;

        self.redis_client
            .set_indexer_state(indexer_config, raw_state)
            .await
    }

    pub async fn get_sync_status(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<SyncStatus> {
        let indexer_state = self.get_state(indexer_config).await?;

        if indexer_state.is_none() {
            return Ok(SyncStatus::New);
        }

        let indexer_state = indexer_state.unwrap();

        match indexer_config
            .get_registry_version()
            .cmp(&indexer_state.synced_at_block_height)
        {
            Ordering::Equal => Ok(SyncStatus::Synced),
            Ordering::Greater => Ok(SyncStatus::Outdated),
            Ordering::Less => {
                tracing::warn!(
                    "Found stream with version greater than registry, treating as outdated"
                );

                Ok(SyncStatus::Outdated)
            }
        }
    }

    pub async fn set_synced(&self, indexer_config: &IndexerConfig) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(indexer_config).await?.unwrap_or_default();

        indexer_state.synced_at_block_height = indexer_config.get_registry_version();

        self.set_state(indexer_config, indexer_state).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use mockall::predicate;
    use registry_types::{Rule, StartBlock, Status};

    #[tokio::test]
    pub async fn outdated_indexer() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: Some(200),
            start_block: StartBlock::Continue,
        };

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_indexer_state()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "synced_at_block_height": 300 }).to_string(),
                ))
            });

        let indexer_manager = IndexerManagerImpl::new(redis_client);
        let result = indexer_manager
            .get_sync_status(&indexer_config)
            .await
            .unwrap();

        assert_eq!(result, SyncStatus::Outdated);
    }

    #[tokio::test]
    pub async fn synced_indexer() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: Some(200),
            start_block: StartBlock::Continue,
        };

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_indexer_state()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "synced_at_block_height": 200 }).to_string(),
                ))
            });

        let indexer_manager = IndexerManagerImpl::new(redis_client);
        let result = indexer_manager
            .get_sync_status(&indexer_config)
            .await
            .unwrap();

        assert_eq!(result, SyncStatus::Synced);
    }

    #[tokio::test]
    pub async fn new_indexer() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: None,
            start_block: StartBlock::Continue,
        };

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_indexer_state()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(None));

        let indexer_manager = IndexerManagerImpl::new(redis_client);
        let result = indexer_manager
            .get_sync_status(&indexer_config)
            .await
            .unwrap();

        assert_eq!(result, SyncStatus::New);
    }
}
