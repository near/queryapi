use std::cmp::Ordering;

use crate::indexer_config::IndexerConfig;
use crate::redis::RedisClient;
use crate::registry::IndexerRegistry;

#[derive(Debug, PartialEq, Eq)]
pub enum SyncStatus {
    Synced,
    Outdated,
    New,
}

#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize)]
struct IndexerState {
    // block_stream_synced_at/executor_synced_at? to?
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

    pub async fn migrate_state_if_needed(
        &self,
        indexer_registry: &IndexerRegistry,
    ) -> anyhow::Result<()> {
        if self.redis_client.is_migration_complete().await?.is_some() {
            return Ok(());
        }

        tracing::info!("Migrating indexer state");

        for (_, indexers) in indexer_registry.iter() {
            for (_, indexer_config) in indexers.iter() {
                if let Some(version) = self.redis_client.get_stream_version(indexer_config).await? {
                    self.set_state(
                        indexer_config,
                        IndexerState {
                            synced_at_block_height: version,
                        },
                    )
                    .await?;
                }
            }
        }

        tracing::info!("Indexer state migration complete");

        self.redis_client.set_migration_complete().await?;

        Ok(())
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

    use std::collections::HashMap;

    use mockall::predicate;
    use registry_types::{Rule, StartBlock, Status};

    #[tokio::test]
    async fn migrates_state() {
        let morgs_config = IndexerConfig {
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
            start_block: StartBlock::Height(100),
        };
        let darunrs_config = IndexerConfig {
            account_id: "darunrs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: None,
            start_block: StartBlock::Height(100),
        };

        let indexer_registry = HashMap::from([
            (
                "morgs.near".parse().unwrap(),
                HashMap::from([("test".to_string(), morgs_config.clone())]),
            ),
            (
                "darunrs.near".parse().unwrap(),
                HashMap::from([("test".to_string(), darunrs_config.clone())]),
            ),
        ]);

        let mut mock_redis_client = RedisClient::default();
        mock_redis_client
            .expect_is_migration_complete()
            .returning(|| Ok(None))
            .once();
        mock_redis_client
            .expect_set_migration_complete()
            .returning(|| Ok(()))
            .once();
        mock_redis_client
            .expect_get_stream_version()
            .with(predicate::eq(morgs_config.clone()))
            .returning(|_| Ok(Some(200)))
            .once();
        mock_redis_client
            .expect_get_stream_version()
            .with(predicate::eq(darunrs_config.clone()))
            .returning(|_| Ok(Some(1)))
            .once();
        mock_redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(morgs_config),
                predicate::eq(serde_json::json!({ "synced_at_block_height": 200 }).to_string()),
            )
            .returning(|_, _| Ok(()))
            .once();
        mock_redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(darunrs_config),
                predicate::eq(serde_json::json!({ "synced_at_block_height": 1 }).to_string()),
            )
            .returning(|_, _| Ok(()))
            .once();

        let indexer_manager = IndexerManagerImpl::new(mock_redis_client);

        indexer_manager
            .migrate_state_if_needed(&indexer_registry)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn skips_state_migration() {
        let morgs_config = IndexerConfig {
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
            start_block: StartBlock::Height(100),
        };

        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), morgs_config.clone())]),
        )]);

        let mut mock_redis_client = RedisClient::default();
        mock_redis_client
            .expect_is_migration_complete()
            .returning(|| Ok(Some(true)))
            .once();
        mock_redis_client
            .expect_set_migration_complete()
            .returning(|| Ok(()))
            .never();
        mock_redis_client
            .expect_get_stream_version()
            .with(predicate::eq(morgs_config.clone()))
            .returning(|_| Ok(Some(200)))
            .never();
        mock_redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(morgs_config),
                predicate::eq(serde_json::json!({ "synced_at_block_height": 200 }).to_string()),
            )
            .returning(|_, _| Ok(()))
            .never();

        let indexer_manager = IndexerManagerImpl::new(mock_redis_client);

        indexer_manager
            .migrate_state_if_needed(&indexer_registry)
            .await
            .unwrap();
    }

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
