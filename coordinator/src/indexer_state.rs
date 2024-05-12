#![cfg_attr(test, allow(dead_code))]

use std::cmp::Ordering;

use crate::indexer_config::{IndexerConfig, IndexerIdentity};
use crate::redis::RedisClient;
use crate::registry::IndexerRegistry;

#[derive(Debug, PartialEq, Eq)]
pub enum SyncStatus {
    Synced,
    Outdated,
    New,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct OldIndexerState {
    block_stream_synced_at: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct IndexerState {
    block_stream_synced_at: Option<u64>,
    enabled: bool,
}

impl Default for IndexerState {
    fn default() -> Self {
        Self {
            block_stream_synced_at: None,
            enabled: true,
        }
    }
}

#[cfg(not(test))]
pub use IndexerStateManagerImpl as IndexerStateManager;
#[cfg(test)]
pub use MockIndexerStateManagerImpl as IndexerStateManager;

pub struct IndexerStateManagerImpl {
    redis_client: RedisClient,
}

#[cfg_attr(test, mockall::automock)]
impl IndexerStateManagerImpl {
    pub fn new(redis_client: RedisClient) -> Self {
        Self { redis_client }
    }

    async fn get_state(&self, identity: &IndexerIdentity) -> anyhow::Result<IndexerState> {
        let raw_state = self.redis_client.get_indexer_state(identity).await?;

        if let Some(raw_state) = raw_state {
            return Ok(serde_json::from_str(&raw_state)?);
        }

        Ok(IndexerState::default())
    }

    async fn set_state(
        &self,
        identity: &IndexerIdentity,
        state: IndexerState,
    ) -> anyhow::Result<()> {
        let raw_state = serde_json::to_string(&state)?;

        self.redis_client
            .set_indexer_state(identity, raw_state)
            .await
    }

    pub async fn set_enabled(
        &self,
        identity: &IndexerIdentity,
        enabled: bool,
    ) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(identity).await?;
        indexer_state.enabled = enabled;

        self.set_state(identity, indexer_state).await?;

        Ok(())
    }

    pub async fn migrate_state_if_needed(
        &self,
        indexer_registry: &IndexerRegistry,
    ) -> anyhow::Result<()> {
        if self.redis_client.is_migration_complete().await?.is_none() {
            tracing::info!("Migrating indexer state");

            for (_, indexers) in indexer_registry.iter() {
                for (_, indexer_config) in indexers.iter() {
                    if let Some(version) =
                        self.redis_client.get_stream_version(indexer_config).await?
                    {
                        self.redis_client
                            .set_indexer_state(
                                indexer_config,
                                serde_json::to_string(&OldIndexerState {
                                    block_stream_synced_at: Some(version),
                                })?,
                            )
                            .await?;
                    }
                }
            }

            tracing::info!("Indexer state migration complete");

            self.redis_client.set_migration_complete().await?;
        }

        Ok(())
    }

    pub async fn get_block_stream_sync_status(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<SyncStatus> {
        let indexer_state = self.get_state(&indexer_config.into()).await?;

        if indexer_state.block_stream_synced_at.is_none() {
            return Ok(SyncStatus::New);
        }

        match indexer_config
            .get_registry_version()
            .cmp(&indexer_state.block_stream_synced_at.unwrap())
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

    pub async fn set_block_stream_synced(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(&indexer_config.into()).await?;

        indexer_state.block_stream_synced_at = Some(indexer_config.get_registry_version());

        self.set_state(&indexer_config.into(), indexer_state)
            .await?;

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
    async fn migrates_state_to_indexer_manager() {
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
            .expect_is_migration_complete()
            .returning(|| Ok(Some(true)))
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
                predicate::eq(serde_json::json!({ "block_stream_synced_at": 200 }).to_string()),
            )
            .returning(|_, _| Ok(()))
            .once();
        mock_redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(darunrs_config),
                predicate::eq(serde_json::json!({ "block_stream_synced_at": 1 }).to_string()),
            )
            .returning(|_, _| Ok(()))
            .once();

        let indexer_manager = IndexerStateManagerImpl::new(mock_redis_client);

        indexer_manager
            .migrate_state_if_needed(&indexer_registry)
            .await
            .unwrap();

        // ensure it is only called once
        indexer_manager
            .migrate_state_if_needed(&indexer_registry)
            .await
            .unwrap();
    }

    #[tokio::test]
    pub async fn outdated_block_stream() {
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
            .with(predicate::eq(IndexerIdentity::from(indexer_config.clone())))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "block_stream_synced_at": 300, "enabled": true })
                        .to_string(),
                ))
            });

        let indexer_manager = IndexerStateManagerImpl::new(redis_client);
        let result = indexer_manager
            .get_block_stream_sync_status(&indexer_config)
            .await
            .unwrap();

        assert_eq!(result, SyncStatus::Outdated);
    }

    #[tokio::test]
    pub async fn synced_block_stream() {
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
            .with(predicate::eq(IndexerIdentity::from(indexer_config.clone())))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "block_stream_synced_at": 200, "enabled": true })
                        .to_string(),
                ))
            });

        let indexer_manager = IndexerStateManagerImpl::new(redis_client);
        let result = indexer_manager
            .get_block_stream_sync_status(&indexer_config)
            .await
            .unwrap();

        assert_eq!(result, SyncStatus::Synced);
    }

    #[tokio::test]
    pub async fn new_block_stream() {
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
            .with(predicate::eq(IndexerIdentity::from(indexer_config.clone())))
            .returning(|_| Ok(None));

        let indexer_manager = IndexerStateManagerImpl::new(redis_client);
        let result = indexer_manager
            .get_block_stream_sync_status(&indexer_config)
            .await
            .unwrap();

        assert_eq!(result, SyncStatus::New);
    }

    #[tokio::test]
    pub async fn disable_indexer() {
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
            .with(predicate::eq(IndexerIdentity::from(indexer_config.clone())))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "block_stream_synced_at": 123, "enabled": true })
                        .to_string(),
                ))
            });
        redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(IndexerIdentity::from(indexer_config.clone())),
                predicate::eq(
                    serde_json::json!({ "block_stream_synced_at":123, "enabled": false })
                        .to_string(),
                ),
            )
            .returning(|_, _| Ok(()))
            .once();

        let indexer_manager = IndexerStateManagerImpl::new(redis_client);

        indexer_manager
            .set_enabled(&indexer_config.into(), false)
            .await
            .unwrap();
    }
}
