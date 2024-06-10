#![cfg_attr(test, allow(dead_code))]

use anyhow::Context;
use near_primitives::types::AccountId;
use std::cmp::Ordering;
use std::str::FromStr;

use crate::indexer_config::IndexerConfig;
use crate::redis::RedisClient;
use crate::registry::IndexerRegistry;

#[derive(Debug, PartialEq, Eq)]
pub enum SyncStatus {
    Synced,
    Outdated,
    New,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OldIndexerState {
    pub block_stream_synced_at: Option<u64>,
    pub enabled: bool,
}

// NOTE We'll need to add more fields here - is there a way to gracefully handle non-existant
// fields during serde deserialization? it's annoying to always have to migrate this
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IndexerState {
    // TODO need to migrate existing state
    pub account_id: AccountId,
    pub function_name: String,
    // TODO this no longer needs to be optional, because the existance of the state object implies
    // that the stream has been started
    //
    // but we might need to write the state object before we register, so therefore may need this
    // to be none
    pub block_stream_synced_at: Option<u64>,
    pub enabled: bool,
}

impl Default for IndexerState {
    fn default() -> Self {
        Self {
            account_id: AccountId::from_str("morgs.near").unwrap(),
            function_name: String::new(),
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

    pub async fn migrate(&self, registry: &IndexerRegistry) -> anyhow::Result<()> {
        if self.redis_client.indexer_states_set_exists().await? {
            return Ok(());
        }

        tracing::info!("Migrating indexer state");

        for config in registry.iter() {
            let raw_state = self.redis_client.get_indexer_state(config).await?;

            let state = if let Some(raw_state) = raw_state {
                let old_state: OldIndexerState =
                    serde_json::from_str(&raw_state).context(format!(
                        "Failed to deserialize OldIndexerState for {}",
                        config.get_full_name()
                    ))?;

                IndexerState {
                    account_id: config.account_id.clone(),
                    function_name: config.function_name.clone(),
                    block_stream_synced_at: old_state.block_stream_synced_at,
                    enabled: old_state.enabled,
                }
            } else {
                self.get_default_state(config)
            };

            self.set_state(config, state).await.context(format!(
                "Failed to set state for {}",
                config.get_full_name()
            ))?;
        }

        tracing::info!("Migration complete");

        Ok(())
    }

    fn get_default_state(&self, indexer_config: &IndexerConfig) -> IndexerState {
        IndexerState {
            account_id: indexer_config.account_id.clone(),
            function_name: indexer_config.function_name.clone(),
            block_stream_synced_at: None,
            enabled: true,
        }
    }

    pub async fn get_state(&self, indexer_config: &IndexerConfig) -> anyhow::Result<IndexerState> {
        let raw_state = self.redis_client.get_indexer_state(indexer_config).await?;

        if let Some(raw_state) = raw_state {
            return Ok(serde_json::from_str(&raw_state)?);
        }

        Ok(self.get_default_state(indexer_config))
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

    pub async fn set_synced(&self, indexer_config: &IndexerConfig) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(indexer_config).await?;

        indexer_state.block_stream_synced_at = Some(indexer_config.get_registry_version());

        self.set_state(indexer_config, indexer_state).await?;

        Ok(())
    }

    pub async fn set_enabled(
        &self,
        indexer_config: &IndexerConfig,
        enabled: bool,
    ) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(indexer_config).await?;
        indexer_state.enabled = enabled;

        self.set_state(indexer_config, indexer_state).await?;

        Ok(())
    }

    pub async fn filter_disabled_indexers(
        &self,
        indexer_registry: &IndexerRegistry,
    ) -> anyhow::Result<IndexerRegistry> {
        let mut filtered_registry = IndexerRegistry::new();

        for indexer_config in indexer_registry.iter() {
            let indexer_state = self.get_state(indexer_config).await?;

            if indexer_state.enabled {
                filtered_registry
                    .0
                    .entry(indexer_config.account_id.clone())
                    .or_default()
                    .insert(indexer_config.function_name.clone(), indexer_config.clone());
            }
        }

        Ok(filtered_registry)
    }

    pub async fn get_block_stream_sync_status(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<SyncStatus> {
        let indexer_state = self.get_state(indexer_config).await?;

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
        let mut indexer_state = self.get_state(indexer_config).await?;

        indexer_state.block_stream_synced_at = Some(indexer_config.get_registry_version());

        self.set_state(indexer_config, indexer_state).await?;

        Ok(())
    }

    pub async fn list(&self) -> anyhow::Result<Vec<IndexerState>> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::HashMap;

    use mockall::predicate;
    use registry_types::{Rule, StartBlock, Status};

    #[tokio::test]
    async fn migrate() {
        let config1 = IndexerConfig::default();
        let config2 = IndexerConfig {
            account_id: "darunrs.near".parse().unwrap(),
            function_name: "test".to_string(),
            ..Default::default()
        };

        let registry = IndexerRegistry::from(&[
            (
                "morgs.near".parse().unwrap(),
                HashMap::from([("test".to_string(), config1.clone())]),
            ),
            (
                "darunrs.near".parse().unwrap(),
                HashMap::from([("test".to_string(), config2.clone())]),
            ),
        ]);

        let mut mock_redis_client = RedisClient::default();
        mock_redis_client
            .expect_indexer_states_set_exists()
            .returning(|| Ok(false))
            .once();
        mock_redis_client
            .expect_get_indexer_state()
            .with(predicate::eq(config1.clone()))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "block_stream_synced_at": 200, "enabled": false })
                        .to_string(),
                ))
            })
            .once();
        mock_redis_client
            .expect_get_indexer_state()
            .with(predicate::eq(config2.clone()))
            .returning(|_| Ok(None))
            .once();
        mock_redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(config1),
                predicate::eq(
                    "{\"account_id\":\"morgs.near\",\"function_name\":\"test\",\"block_stream_synced_at\":200,\"enabled\":false}".to_string(),
                ),
            )
            .returning(|_, _| Ok(()))
            .once();
        mock_redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(config2),
                predicate::eq(
                    "{\"account_id\":\"darunrs.near\",\"function_name\":\"test\",\"block_stream_synced_at\":null,\"enabled\":true}".to_string()
                ),
            )
            .returning(|_, _| Ok(()))
            .once();

        let indexer_manager = IndexerStateManagerImpl::new(mock_redis_client);

        indexer_manager.migrate(&registry).await.unwrap();
    }

    #[tokio::test]
    async fn filters_disabled_indexers() {
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

        let indexer_registry = IndexerRegistry::from(&[
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
            .expect_get_indexer_state()
            .with(predicate::eq(morgs_config.clone()))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "block_stream_synced_at": 200, "enabled": true })
                        .to_string(),
                ))
            })
            .once();
        mock_redis_client
            .expect_get_indexer_state()
            .with(predicate::eq(darunrs_config.clone()))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "block_stream_synced_at": 1, "enabled": false })
                        .to_string(),
                ))
            })
            .once();

        let indexer_manager = IndexerStateManagerImpl::new(mock_redis_client);

        let filtered_registry = indexer_manager
            .filter_disabled_indexers(&indexer_registry)
            .await
            .unwrap();

        assert!(filtered_registry.contains_key(&morgs_config.account_id));
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
            .with(predicate::eq(indexer_config.clone()))
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
            .with(predicate::eq(indexer_config.clone()))
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
            .with(predicate::eq(indexer_config.clone()))
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
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| {
                Ok(Some(
                    serde_json::json!({ "block_stream_synced_at": 123, "enabled": true })
                        .to_string(),
                ))
            });
        redis_client
            .expect_set_indexer_state()
            .with(
                predicate::eq(indexer_config.clone()),
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
