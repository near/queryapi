#![cfg_attr(test, allow(dead_code))]

use anyhow::Context;
use near_primitives::types::AccountId;

use crate::indexer_config::IndexerConfig;
use crate::redis::RedisClient;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum ProvisionedState {
    Unprovisioned,
    Provisioning { task_id: String },
    Provisioned,
    Deprovisioning { task_id: String },
    Failed,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct OldIndexerState {
    pub account_id: AccountId,
    pub function_name: String,
    pub block_stream_synced_at: Option<u64>,
    pub enabled: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct IndexerState {
    pub account_id: AccountId,
    pub function_name: String,
    pub block_stream_synced_at: Option<u64>,
    pub enabled: bool,
    pub provisioned_state: ProvisionedState,
}

// FIX `IndexerConfig` does not exist after an Indexer is deleted, and we need a way to
// construct the state key without it. But, this isn't ideal as we now have two places which
// define this key - we need to consolidate these somehow.
impl IndexerState {
    pub fn get_state_key(&self) -> String {
        format!("{}/{}:state", self.account_id, self.function_name)
    }

    pub fn get_redis_stream_key(&self) -> String {
        format!("{}/{}:block_stream", self.account_id, self.function_name)
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

    pub async fn migrate(&self) -> anyhow::Result<()> {
        let raw_states = self.redis_client.list_indexer_states().await?;

        for raw_state in raw_states {
            if let Ok(state) = serde_json::from_str::<IndexerState>(&raw_state) {
                tracing::info!(
                    "{}/{} already migrated, skipping",
                    state.account_id,
                    state.function_name
                );
                continue;
            }

            tracing::info!("Migrating {}", raw_state);

            let old_state: OldIndexerState = serde_json::from_str(&raw_state)?;

            let state = IndexerState {
                account_id: old_state.account_id,
                function_name: old_state.function_name,
                block_stream_synced_at: old_state.block_stream_synced_at,
                enabled: old_state.enabled,
                provisioned_state: ProvisionedState::Provisioned,
            };

            self.redis_client
                .set(state.get_state_key(), serde_json::to_string(&state)?)
                .await?;
        }

        Ok(())
    }

    fn get_default_state(&self, indexer_config: &IndexerConfig) -> IndexerState {
        IndexerState {
            account_id: indexer_config.account_id.clone(),
            function_name: indexer_config.function_name.clone(),
            block_stream_synced_at: None,
            enabled: true,
            provisioned_state: ProvisionedState::Unprovisioned,
        }
    }

    pub async fn get_state(&self, indexer_config: &IndexerConfig) -> anyhow::Result<IndexerState> {
        let raw_state = self.redis_client.get_indexer_state(indexer_config).await?;

        if let Some(raw_state) = raw_state {
            return Ok(serde_json::from_str(&raw_state)?);
        }

        Ok(self.get_default_state(indexer_config))
    }

    pub async fn delete_state(&self, indexer_state: &IndexerState) -> anyhow::Result<()> {
        self.redis_client.delete_indexer_state(indexer_state).await
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

    pub async fn set_deprovisioning(
        &self,
        indexer_state: &IndexerState,
        task_id: String,
    ) -> anyhow::Result<()> {
        let mut state = indexer_state.clone();

        state.provisioned_state = ProvisionedState::Deprovisioning { task_id };

        self.redis_client
            .set(state.get_state_key(), serde_json::to_string(&state)?)
            .await?;

        Ok(())
    }

    pub async fn set_provisioning(
        &self,
        indexer_config: &IndexerConfig,
        task_id: String,
    ) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(indexer_config).await?;

        indexer_state.provisioned_state = ProvisionedState::Provisioning { task_id };

        self.set_state(indexer_config, indexer_state).await?;

        Ok(())
    }

    pub async fn set_provisioned(&self, indexer_config: &IndexerConfig) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(indexer_config).await?;

        indexer_state.provisioned_state = ProvisionedState::Provisioned;

        self.set_state(indexer_config, indexer_state).await?;

        Ok(())
    }
    pub async fn set_provisioning_failure(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<()> {
        let mut indexer_state = self.get_state(indexer_config).await?;

        indexer_state.provisioned_state = ProvisionedState::Failed;

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

    pub async fn list(&self) -> anyhow::Result<Vec<IndexerState>> {
        self.redis_client
            .list_indexer_states()
            .await?
            .iter()
            .try_fold(Vec::new(), |mut acc, raw_state| {
                acc.push(
                    serde_json::from_str(raw_state)
                        .context(format!("failed to deserailize {raw_state}"))?,
                );
                anyhow::Ok(acc)
            })
            .context("Failed to deserialize indexer states")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use mockall::predicate;
    use registry_types::{Rule, StartBlock, Status};

    #[tokio::test]
    async fn migrate() {
        let config = IndexerConfig::default();
        let mut mock_redis_client = RedisClient::default();
        mock_redis_client
            .expect_list_indexer_states()
            .returning(|| Ok(vec![serde_json::json!({ "account_id": "morgs.near", "function_name": "test", "block_stream_synced_at": 200, "enabled": true }).to_string()]))
            .once();
        mock_redis_client
            .expect_set::<String, String>()
            .with(
                predicate::eq(config.get_state_key()),
                predicate::eq("{\"account_id\":\"morgs.near\",\"function_name\":\"test\",\"block_stream_synced_at\":200,\"enabled\":true,\"provisioned_state\":\"Provisioned\"}".to_string()),
            )
            .returning(|_, _| Ok(()))
            .once();

        let indexer_manager = IndexerStateManagerImpl::new(mock_redis_client);

        indexer_manager.migrate().await.unwrap();
    }

    #[tokio::test]
    async fn list_indexer_states() {
        let mut mock_redis_client = RedisClient::default();
        mock_redis_client
            .expect_list_indexer_states()
            .returning(|| Ok(vec![serde_json::json!({ "account_id": "morgs.near", "function_name": "test", "block_stream_synced_at": 200, "enabled": true, "provisioned_state": "Provisioned" }).to_string()]))
            .once();
        mock_redis_client
            .expect_list_indexer_states()
            .returning(|| Ok(vec![serde_json::json!({}).to_string()]))
            .once();

        let indexer_manager = IndexerStateManagerImpl::new(mock_redis_client);

        assert_eq!(indexer_manager.list().await.unwrap().len(), 1);
        assert!(indexer_manager.list().await.is_err());
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
                    serde_json::json!({ "account_id": "morgs.near", "function_name": "test", "block_stream_synced_at": 123, "enabled": true, "provisioned_state": "Provisioned" })
                        .to_string(),
                ))
            });
        redis_client
            .expect_set_indexer_state()
            .with(
                predicate::always(),
                predicate::eq("{\"account_id\":\"morgs.near\",\"function_name\":\"test\",\"block_stream_synced_at\":123,\"enabled\":false,\"provisioned_state\":\"Provisioned\"}".to_string()),
            )
            .returning(|_, _| Ok(()))
            .once();

        let indexer_manager = IndexerStateManagerImpl::new(redis_client);

        indexer_manager
            .set_enabled(&indexer_config, false)
            .await
            .unwrap();
    }
}
