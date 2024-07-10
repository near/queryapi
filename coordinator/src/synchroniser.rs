use registry_types::StartBlock;
use tracing::instrument;

use crate::handlers::block_streams::{BlockStreamsHandler, StreamInfo};
use crate::handlers::data_layer::{DataLayerHandler, TaskStatus};
use crate::handlers::executors::{ExecutorInfo, ExecutorsHandler};
use crate::indexer_config::IndexerConfig;
use crate::indexer_state::{IndexerState, IndexerStateManager, ProvisionedState};
use crate::redis::{KeyProvider, RedisClient};
use crate::registry::Registry;

#[allow(clippy::large_enum_variant)]
#[derive(Debug)]
pub enum SynchronisationState {
    New(IndexerConfig),
    Existing(
        IndexerConfig,
        IndexerState,
        Option<ExecutorInfo>,
        Option<StreamInfo>,
    ),
    Deleted(IndexerState, Option<ExecutorInfo>, Option<StreamInfo>),
}

pub struct Synchroniser<'a> {
    block_streams_handler: &'a BlockStreamsHandler,
    executors_handler: &'a ExecutorsHandler,
    data_layer_handler: &'a DataLayerHandler,
    registry: &'a Registry,
    state_manager: &'a IndexerStateManager,
    redis_client: &'a RedisClient,
}

impl<'a> Synchroniser<'a> {
    pub fn new(
        block_streams_handler: &'a BlockStreamsHandler,
        executors_handler: &'a ExecutorsHandler,
        data_layer_handler: &'a DataLayerHandler,
        registry: &'a Registry,
        state_manager: &'a IndexerStateManager,
        redis_client: &'a RedisClient,
    ) -> Self {
        Self {
            block_streams_handler,
            executors_handler,
            data_layer_handler,
            registry,
            state_manager,
            redis_client,
        }
    }

    async fn start_new_block_stream(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        let height = match config.start_block {
            StartBlock::Height(height) => height,
            StartBlock::Latest => config.get_registry_version(),
            StartBlock::Continue => {
                tracing::warn!(
                    "Attempted to start new Block Stream with CONTINUE, using LATEST instead"
                );
                config.get_registry_version()
            }
        };

        tracing::info!(height, "Starting block stream");

        self.block_streams_handler.start(height, config).await
    }

    #[instrument(
        skip_all,
        fields(
            account_id = config.account_id.to_string(),
            function_name = config.function_name,
            version = config.get_registry_version()
        )
    )]
    async fn sync_new_indexer(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        tracing::info!("Starting data layer provisioning");

        let task_id = self
            .data_layer_handler
            .start_provisioning_task(config)
            .await?;

        self.state_manager.set_provisioning(config, task_id).await?;

        Ok(())
    }

    async fn sync_existing_executor(
        &self,
        config: &IndexerConfig,
        executor: Option<&ExecutorInfo>,
    ) -> anyhow::Result<()> {
        if let Some(executor) = executor {
            if executor.version == config.get_registry_version() {
                return Ok(());
            }

            tracing::info!("Stopping outdated executor");

            self.executors_handler
                .stop(executor.executor_id.clone())
                .await?;
        }

        tracing::info!("Starting executor");

        self.executors_handler.start(config).await?;

        Ok(())
    }

    async fn get_continuation_block_height(&self, config: &IndexerConfig) -> anyhow::Result<u64> {
        let height = self
            .redis_client
            .get_last_published_block(config)
            .await?
            .map(|height| height + 1)
            .unwrap_or_else(|| {
                tracing::warn!(
                    "Failed to get continuation block height, using registry version instead"
                );

                config.get_registry_version()
            });

        Ok(height)
    }

    async fn reconfigure_block_stream(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        if matches!(
            config.start_block,
            StartBlock::Latest | StartBlock::Height(..)
        ) {
            self.redis_client.clear_block_stream(config).await?;
        }

        let height = match config.start_block {
            StartBlock::Latest => config.get_registry_version(),
            StartBlock::Height(height) => height,
            StartBlock::Continue => self.get_continuation_block_height(config).await?,
        };

        tracing::info!(height, "Starting block stream");

        self.block_streams_handler.start(height, config).await?;

        Ok(())
    }

    async fn resume_block_stream(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        let height = self.get_continuation_block_height(config).await?;

        tracing::info!(height, "Resuming block stream");

        self.block_streams_handler.start(height, config).await?;

        Ok(())
    }

    async fn sync_existing_block_stream(
        &self,
        config: &IndexerConfig,
        state: &IndexerState,
        block_stream: Option<&StreamInfo>,
    ) -> anyhow::Result<()> {
        if let Some(block_stream) = block_stream {
            if block_stream.version == config.get_registry_version() {
                return Ok(());
            }

            tracing::info!(
                previous_version = block_stream.version,
                "Stopping outdated block stream"
            );

            self.block_streams_handler
                .stop(block_stream.stream_id.clone())
                .await?;

            self.reconfigure_block_stream(config).await?;

            return Ok(());
        }

        if state.block_stream_synced_at.is_none() {
            self.start_new_block_stream(config).await?;

            return Ok(());
        }

        if state.block_stream_synced_at.unwrap() != config.get_registry_version() {
            self.reconfigure_block_stream(config).await?;

            return Ok(());
        }

        self.resume_block_stream(config).await?;

        Ok(())
    }

    async fn ensure_provisioned(
        &self,
        config: &IndexerConfig,
        task_id: String,
    ) -> anyhow::Result<()> {
        let task_status_result = self.data_layer_handler.get_task_status(task_id).await;

        if let Err(error) = task_status_result {
            tracing::warn!(?error, "Failed to check provisioning task status");

            return Ok(());
        };

        let _ = match task_status_result.unwrap() {
            TaskStatus::Complete => {
                tracing::info!("Data layer provisioning complete");
                self.state_manager.set_provisioned(config).await
            }
            TaskStatus::Pending => Ok(()),
            _ => {
                tracing::warn!("Data layer provisioning failed");
                self.state_manager.set_provisioning_failure(config).await
            }
        }
        .map_err(|err| tracing::warn!(?err, "Failed to set provisioning state"));

        Ok(())
    }

    #[instrument(
        skip_all,
        fields(
            account_id = config.account_id.to_string(),
            function_name = config.function_name,
            version = config.get_registry_version()
        )
    )]
    async fn sync_existing_indexer(
        &self,
        config: &IndexerConfig,
        state: &IndexerState,
        executor: Option<&ExecutorInfo>,
        block_stream: Option<&StreamInfo>,
    ) -> anyhow::Result<()> {
        match &state.provisioned_state {
            ProvisionedState::Provisioning { task_id } => {
                self.ensure_provisioned(config, task_id.clone()).await?;
                return Ok(());
            }
            ProvisionedState::Failed => return Ok(()),
            ProvisionedState::Provisioned => {}
            ProvisionedState::Unprovisioned | ProvisionedState::Deprovisioning { .. } => {
                anyhow::bail!("Provisioning task should have been started")
            }
        }

        if !state.enabled {
            if let Some(executor) = executor {
                self.executors_handler
                    .stop(executor.executor_id.clone())
                    .await?;
            }

            if let Some(block_stream) = block_stream {
                self.block_streams_handler
                    .stop(block_stream.stream_id.clone())
                    .await?;
            }

            return Ok(());
        }

        if let Err(error) = self.sync_existing_executor(config, executor).await {
            tracing::error!(?error, "Failed to sync executor");
            return Ok(());
        }

        if let Err(error) = self
            .sync_existing_block_stream(config, state, block_stream)
            .await
        {
            tracing::error!(?error, "Failed to sync block stream");
            return Ok(());
        }

        self.state_manager.set_synced(config).await?;

        Ok(())
    }

    #[instrument(
        skip_all,
        fields(
            account_id = state.account_id.to_string(),
            function_name = state.function_name
        )
    )]
    async fn sync_deleted_indexer(
        &self,
        state: &IndexerState,
        executor: Option<&ExecutorInfo>,
        block_stream: Option<&StreamInfo>,
    ) -> anyhow::Result<()> {
        if let Some(executor) = executor {
            tracing::info!("Stopping executor");

            self.executors_handler
                .stop(executor.executor_id.clone())
                .await?;
        }

        if let Some(block_stream) = block_stream {
            tracing::info!("Stopping block stream");

            self.block_streams_handler
                .stop(block_stream.stream_id.clone())
                .await?;
        }

        if let ProvisionedState::Deprovisioning { task_id } = &state.provisioned_state {
            match self
                .data_layer_handler
                .get_task_status(task_id.clone())
                .await?
            {
                TaskStatus::Complete => {
                    tracing::info!("Data layer deprovisioning complete");
                }
                TaskStatus::Failed => {
                    tracing::info!("Data layer deprovisioning failed");
                }
                TaskStatus::Unspecified => {
                    tracing::info!("Encountered unspecified deprovisioning task status");
                }
                TaskStatus::Pending => return Ok(()),
            }
        } else {
            let task_id = self
                .data_layer_handler
                .start_deprovisioning_task(state.account_id.clone(), state.function_name.clone())
                .await?;

            self.state_manager
                .set_deprovisioning(state, task_id.clone())
                .await?;

            return Ok(());
        }

        self.redis_client.del(state.get_redis_stream_key()).await?;

        self.state_manager.delete_state(state).await?;

        Ok(())
    }

    async fn generate_synchronisation_states(&self) -> anyhow::Result<Vec<SynchronisationState>> {
        let states = self.state_manager.list().await?;
        let executors = self.executors_handler.list().await?;
        let block_streams = self.block_streams_handler.list().await?;
        let mut registry = self.registry.fetch().await?;

        let mut sync_states = vec![];

        for state in states {
            let config = registry.remove(&state.account_id, &state.function_name);
            let executor = executors.iter().find(|executor| {
                executor.account_id == state.account_id
                    && executor.function_name == state.function_name
            });
            let block_stream = block_streams.iter().find(|block_stream| {
                block_stream.account_id == state.account_id
                    && block_stream.function_name == state.function_name
            });

            if let Some(config) = config {
                sync_states.push(SynchronisationState::Existing(
                    config,
                    state,
                    executor.cloned(),
                    block_stream.cloned(),
                ))
            } else {
                sync_states.push(SynchronisationState::Deleted(
                    state,
                    executor.cloned(),
                    block_stream.cloned(),
                ))
            }
        }

        for config in registry.iter() {
            sync_states.push(SynchronisationState::New(config.clone()));
        }

        Ok(sync_states)
    }

    pub async fn sync(&self) -> anyhow::Result<()> {
        let sync_states = self.generate_synchronisation_states().await?;

        for sync_state in sync_states {
            match sync_state {
                SynchronisationState::New(config) => {
                    self.sync_new_indexer(&config).await?;
                }
                SynchronisationState::Existing(config, state, executor, block_stream) => {
                    self.sync_existing_indexer(
                        &config,
                        &state,
                        executor.as_ref(),
                        block_stream.as_ref(),
                    )
                    .await?;
                }
                SynchronisationState::Deleted(state, executor, block_stream) => {
                    self.sync_deleted_indexer(&state, executor.as_ref(), block_stream.as_ref())
                        .await?;
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    use mockall::predicate::*;
    use std::collections::HashMap;

    use crate::registry::IndexerRegistry;

    #[tokio::test]
    async fn generates_sync_states() {
        let existing_account_ids = vec![
            "account1.near".to_string(),
            "account2.near".to_string(),
            "account3.near".to_string(),
            "account4.near".to_string(),
        ];
        let new_account_ids = vec![
            "new_account1.near".to_string(),
            "new_account2.near".to_string(),
        ];
        let deleted_account_ids = vec![
            "deleted_account1.near".to_string(),
            "deleted_account2.near".to_string(),
        ];

        let mut existing_indexer_configs: Vec<IndexerConfig> = Vec::new();
        for (i, account_id) in existing_account_ids.iter().enumerate() {
            for j in 1..=5 {
                existing_indexer_configs.push(IndexerConfig {
                    account_id: account_id.parse().unwrap(),
                    function_name: format!("existing_indexer{}_{}", i + 1, j),
                    ..Default::default()
                });
            }
        }

        let mut new_indexer_configs: Vec<IndexerConfig> = Vec::new();
        for (i, account_id) in new_account_ids.iter().enumerate() {
            for j in 1..=3 {
                new_indexer_configs.push(IndexerConfig {
                    account_id: account_id.parse().unwrap(),
                    function_name: format!("new_indexer{}_{}", i + 1, j),
                    ..Default::default()
                });
            }
        }

        let mut deleted_indexer_configs: Vec<IndexerConfig> = Vec::new();
        for (i, account_id) in deleted_account_ids.iter().enumerate() {
            for j in 1..=2 {
                deleted_indexer_configs.push(IndexerConfig {
                    account_id: account_id.parse().unwrap(),
                    function_name: format!("deleted_indexer{}_{}", i + 1, j),
                    ..Default::default()
                });
            }
        }

        let mut indexer_registry = IndexerRegistry::new();
        for indexer in existing_indexer_configs
            .iter()
            .chain(new_indexer_configs.iter())
        {
            indexer_registry
                .entry(indexer.account_id.clone())
                .or_default()
                .insert(indexer.function_name.clone(), indexer.clone());
        }

        let mut block_streams_handler = BlockStreamsHandler::default();
        let block_streams: Vec<StreamInfo> = existing_indexer_configs
            .iter()
            // generate some "randomness"
            .rev()
            .enumerate()
            .map(|(i, indexer)| StreamInfo {
                stream_id: format!("stream_id{}", i + 1),
                account_id: indexer.account_id.to_string(),
                function_name: indexer.function_name.clone(),
                version: indexer.get_registry_version(),
            })
            .collect();
        block_streams_handler
            .expect_list()
            .returning(move || Ok(block_streams.clone()));

        let mut executors_handler = ExecutorsHandler::default();
        let executors: Vec<ExecutorInfo> = existing_indexer_configs
            .iter()
            // generate some "randomness"
            .rev()
            .enumerate()
            .map(|(i, indexer)| ExecutorInfo {
                executor_id: format!("executor_id{}", i + 1),
                account_id: indexer.account_id.to_string(),
                function_name: indexer.function_name.clone(),
                version: indexer.get_registry_version(),
                status: "running".to_string(),
            })
            .collect();

        executors_handler
            .expect_list()
            .returning(move || Ok(executors.clone()));

        let mut registry = Registry::default();
        registry
            .expect_fetch()
            .returning(move || Ok(indexer_registry.clone()));

        let mut state_manager = IndexerStateManager::default();
        let states: Vec<IndexerState> = existing_indexer_configs
            .iter()
            .map(|indexer| IndexerState {
                account_id: indexer.account_id.clone(),
                function_name: indexer.function_name.clone(),
                block_stream_synced_at: Some(indexer.get_registry_version()),
                enabled: true,
                provisioned_state: ProvisionedState::Provisioned,
            })
            .chain(deleted_indexer_configs.iter().map(|indexer| IndexerState {
                account_id: indexer.account_id.clone(),
                function_name: indexer.function_name.clone(),
                block_stream_synced_at: Some(indexer.get_registry_version()),
                enabled: true,
                provisioned_state: ProvisionedState::Provisioned,
            }))
            .collect();
        state_manager
            .expect_list()
            .returning(move || Ok(states.clone()));

        let redis_client = RedisClient::default();
        let data_layer_handler = DataLayerHandler::default();

        let synchroniser = Synchroniser::new(
            &block_streams_handler,
            &executors_handler,
            &data_layer_handler,
            &registry,
            &state_manager,
            &redis_client,
        );

        let synchronisation_states = synchroniser
            .generate_synchronisation_states()
            .await
            .unwrap();

        let mut new_count = 0;
        let mut existing_count = 0;
        let mut deleted_count = 0;

        for state in &synchronisation_states {
            match state {
                SynchronisationState::New(_) => new_count += 1,
                SynchronisationState::Existing(_, _, executor, block_stream) => {
                    assert!(executor.is_some(), "Executor should exist for the indexer");
                    assert!(
                        block_stream.is_some(),
                        "Block stream should exist for the indexer"
                    );
                    existing_count += 1;
                }
                SynchronisationState::Deleted(_, _, _) => {
                    deleted_count += 1;
                }
            }
        }

        assert_eq!(new_count, 6);
        assert_eq!(existing_count, 20);
        assert_eq!(deleted_count, 4);
    }

    mod new {
        use super::*;

        #[tokio::test]
        async fn triggers_data_layer_provisioning() {
            let config = IndexerConfig::default();

            let indexer_registry = IndexerRegistry::from(&[(
                config.account_id.clone(),
                HashMap::from([(config.function_name.clone(), config.clone())]),
            )]);

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler.expect_list().returning(|| Ok(vec![]));

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_list().returning(|| Ok(vec![]));

            let mut registry = Registry::default();
            registry
                .expect_fetch()
                .returning(move || Ok(indexer_registry.clone()));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_list().returning(|| Ok(vec![]));
            state_manager
                .expect_set_provisioning()
                .with(eq(config.clone()), eq("task_id".to_string()))
                .returning(|_, _| Ok(()))
                .once();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_start_provisioning_task()
                .with(eq(config))
                .returning(|_| Ok("task_id".to_string()))
                .once();

            let redis_client = RedisClient::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser.sync().await.unwrap();
        }
    }

    mod existing {
        use super::*;

        #[tokio::test]
        async fn waits_for_provisioning_to_complete() {
            let config = IndexerConfig::default();

            let indexer_registry = IndexerRegistry::from(&[(
                config.account_id.clone(),
                HashMap::from([(config.function_name.clone(), config.clone())]),
            )]);

            let task_id = "task_id".to_string();

            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version()),
                enabled: true,
                provisioned_state: ProvisionedState::Provisioning {
                    task_id: task_id.clone().to_string(),
                },
            };

            let mut registry = Registry::default();
            registry
                .expect_fetch()
                .returning(move || Ok(indexer_registry.clone()));

            let mut state_manager = IndexerStateManager::default();
            state_manager
                .expect_set_provisioned()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .once();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_get_task_status()
                .with(eq(task_id))
                .returning(|_| Ok(TaskStatus::Complete));

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler.expect_start().never();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_start().never();

            let redis_client = RedisClient::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_existing_indexer(&config, &state, None, None)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn ignores_failed_provisioning() {
            let config = IndexerConfig::default();

            let indexer_registry = IndexerRegistry::from(&[(
                config.account_id.clone(),
                HashMap::from([(config.function_name.clone(), config.clone())]),
            )]);

            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version()),
                enabled: true,
                provisioned_state: ProvisionedState::Provisioning {
                    task_id: "task_id".to_string(),
                },
            };

            let mut registry = Registry::default();
            registry
                .expect_fetch()
                .returning(move || Ok(indexer_registry.clone()));

            let mut state_manager = IndexerStateManager::default();
            state_manager
                .expect_set_provisioning_failure()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .once();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_get_task_status()
                .with(eq("task_id".to_string()))
                .returning(|_| Ok(TaskStatus::Failed));

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler.expect_start().never();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_start().never();

            let redis_client = RedisClient::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_existing_indexer(&config, &state, None, None)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn ignores_synced() {
            let config = IndexerConfig::default();

            let indexer_registry = IndexerRegistry::from(&[(
                config.account_id.clone(),
                HashMap::from([(config.function_name.clone(), config.clone())]),
            )]);

            let mut block_streams_handler = BlockStreamsHandler::default();
            let config_clone = config.clone();
            block_streams_handler.expect_list().returning(move || {
                Ok(vec![StreamInfo {
                    stream_id: config_clone.get_redis_stream_key(),
                    account_id: config_clone.account_id.to_string(),
                    function_name: config_clone.function_name.clone(),
                    version: config_clone.get_registry_version(),
                }])
            });
            block_streams_handler.expect_stop().never();
            block_streams_handler.expect_start().never();

            let mut executors_handler = ExecutorsHandler::default();
            let config_clone = config.clone();
            executors_handler.expect_list().returning(move || {
                Ok(vec![ExecutorInfo {
                    executor_id: "executor_id".to_string(),
                    account_id: config_clone.account_id.to_string(),
                    function_name: config_clone.function_name.clone(),
                    version: config_clone.get_registry_version(),
                    status: "running".to_string(),
                }])
            });
            executors_handler.expect_stop().never();
            executors_handler.expect_start().never();

            let mut registry = Registry::default();
            registry
                .expect_fetch()
                .returning(move || Ok(indexer_registry.clone()));

            let mut state_manager = IndexerStateManager::default();
            state_manager
                .expect_set_synced()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .once();
            state_manager.expect_list().returning(move || {
                Ok(vec![IndexerState {
                    account_id: config.account_id.clone(),
                    function_name: config.function_name.clone(),
                    block_stream_synced_at: Some(config.get_registry_version()),
                    enabled: true,
                    provisioned_state: ProvisionedState::Provisioned,
                }])
            });

            let redis_client = RedisClient::default();
            let data_layer_handler = DataLayerHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser.sync().await.unwrap();
        }

        #[tokio::test]
        async fn restarts_outdated() {
            let config = IndexerConfig::default();

            let indexer_registry = IndexerRegistry::from(&[(
                config.account_id.clone(),
                HashMap::from([(config.function_name.clone(), config.clone())]),
            )]);

            let mut block_streams_handler = BlockStreamsHandler::default();
            let config_clone = config.clone();
            block_streams_handler.expect_list().returning(move || {
                Ok(vec![StreamInfo {
                    stream_id: "stream_id".to_string(),
                    account_id: config_clone.account_id.to_string(),
                    function_name: config_clone.function_name.clone(),
                    version: config_clone.get_registry_version() + 1,
                }])
            });
            block_streams_handler
                .expect_stop()
                .with(eq("stream_id".to_string()))
                .returning(|_| Ok(()))
                .once();
            block_streams_handler
                .expect_start()
                .with(eq(100), eq(config.clone()))
                .returning(|_, _| Ok(()))
                .once();

            let mut executors_handler = ExecutorsHandler::default();
            let config_clone = config.clone();
            executors_handler.expect_list().returning(move || {
                Ok(vec![ExecutorInfo {
                    executor_id: "executor_id".to_string(),
                    account_id: config_clone.account_id.to_string(),
                    function_name: config_clone.function_name.clone(),
                    version: config_clone.get_registry_version() + 1,
                    status: "running".to_string(),
                }])
            });
            executors_handler
                .expect_stop()
                .with(eq("executor_id".to_string()))
                .returning(|_| Ok(()))
                .once();
            executors_handler
                .expect_start()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .once();

            let mut registry = Registry::default();
            registry
                .expect_fetch()
                .returning(move || Ok(indexer_registry.clone()));

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_clear_block_stream()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .once();

            let mut state_manager = IndexerStateManager::default();
            state_manager
                .expect_set_synced()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .once();
            state_manager.expect_list().returning(move || {
                Ok(vec![IndexerState {
                    account_id: config.account_id.clone(),
                    function_name: config.function_name.clone(),
                    block_stream_synced_at: Some(config.get_registry_version()),
                    enabled: true,
                    provisioned_state: ProvisionedState::Provisioned,
                }])
            });

            let data_layer_handler = DataLayerHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser.sync().await.unwrap();
        }

        #[tokio::test]
        async fn treats_unsynced_blocks_streams_as_new() {
            let config = IndexerConfig::default();
            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: None,
                enabled: true,
                provisioned_state: ProvisionedState::Provisioned,
            };

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_start()
                .with(eq(100), eq(config.clone()))
                .returning(|_, _| Ok(()))
                .once();

            let redis_client = RedisClient::default();
            let state_manager = IndexerStateManager::default();
            let executors_handler = ExecutorsHandler::default();
            let registry = Registry::default();
            let data_layer_handler = DataLayerHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_existing_block_stream(&config, &state, None)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn restarts_stopped_and_outdated_block_stream() {
            let config = IndexerConfig::default();
            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version() - 1),
                enabled: true,
                provisioned_state: ProvisionedState::Provisioned,
            };

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_start()
                .with(eq(100), eq(config.clone()))
                .returning(|_, _| Ok(()))
                .once();

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_clear_block_stream()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .once();

            let state_manager = IndexerStateManager::default();
            let executors_handler = ExecutorsHandler::default();
            let registry = Registry::default();
            let data_layer_handler = DataLayerHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_existing_block_stream(&config, &state, None)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn resumes_stopped_and_synced_block_stream() {
            let config = IndexerConfig::default();
            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version()),
                enabled: true,
                provisioned_state: ProvisionedState::Provisioned,
            };

            let last_published_block = 1;

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_clear_block_stream::<IndexerConfig>()
                .never();
            redis_client
                .expect_get_last_published_block()
                .with(eq(config.clone()))
                .returning(move |_| Ok(Some(last_published_block)));

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_start()
                .with(eq(last_published_block + 1), eq(config.clone()))
                .returning(|_, _| Ok(()))
                .once();

            let state_manager = IndexerStateManager::default();
            let executors_handler = ExecutorsHandler::default();
            let registry = Registry::default();
            let data_layer_handler = DataLayerHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_existing_block_stream(&config, &state, None)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn reconfigures_block_stream() {
            let config_with_latest = IndexerConfig {
                start_block: StartBlock::Latest,
                ..IndexerConfig::default()
            };
            let height = 5;
            let config_with_height = IndexerConfig {
                start_block: StartBlock::Height(height),
                ..IndexerConfig::default()
            };
            let last_published_block = 1;
            let config_with_continue = IndexerConfig {
                start_block: StartBlock::Continue,
                ..IndexerConfig::default()
            };

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_start()
                .with(
                    eq(last_published_block + 1),
                    eq(config_with_continue.clone()),
                )
                .returning(|_, _| Ok(()))
                .once();
            block_streams_handler
                .expect_start()
                .with(
                    eq(config_with_latest.get_registry_version()),
                    eq(config_with_latest.clone()),
                )
                .returning(|_, _| Ok(()))
                .once();
            block_streams_handler
                .expect_start()
                .with(eq(height), eq(config_with_height.clone()))
                .returning(|_, _| Ok(()))
                .once();

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_clear_block_stream()
                .with(eq(config_with_latest.clone()))
                .returning(|_| Ok(()))
                .once();
            redis_client
                .expect_clear_block_stream()
                .with(eq(config_with_height.clone()))
                .returning(|_| Ok(()))
                .once();
            redis_client
                .expect_get_last_published_block()
                .with(eq(config_with_continue.clone()))
                .returning(move |_| Ok(Some(last_published_block)));

            let state_manager = IndexerStateManager::default();
            let executors_handler = ExecutorsHandler::default();
            let registry = Registry::default();
            let data_layer_handler = DataLayerHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .reconfigure_block_stream(&config_with_latest)
                .await
                .unwrap();
            synchroniser
                .reconfigure_block_stream(&config_with_height)
                .await
                .unwrap();
            synchroniser
                .reconfigure_block_stream(&config_with_continue)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn stops_disabled_indexers() {
            let config = IndexerConfig::default();
            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version()),
                enabled: false,
                provisioned_state: ProvisionedState::Provisioned,
            };
            let executor = ExecutorInfo {
                executor_id: "executor_id".to_string(),
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                version: config.get_registry_version(),
                status: "running".to_string(),
            };
            let block_stream = StreamInfo {
                stream_id: "stream_id".to_string(),
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                version: config.get_registry_version(),
            };

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_stop()
                .with(eq("stream_id".to_string()))
                .returning(|_| Ok(()))
                .once();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler
                .expect_stop()
                .with(eq("executor_id".to_string()))
                .returning(|_| Ok(()))
                .once();

            let mut state_manager = IndexerStateManager::default();
            state_manager
                .expect_set_synced()
                .with(eq(config.clone()))
                .returning(|_| Ok(()))
                .never();

            let registry = Registry::default();
            let redis_client = RedisClient::default();
            let data_layer_handler = DataLayerHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_existing_indexer(&config, &state, Some(&executor), Some(&block_stream))
                .await
                .unwrap();
            // Simulate second run, start/stop etc should not be called
            synchroniser
                .sync_existing_indexer(&config, &state, None, None)
                .await
                .unwrap();
        }
    }

    mod deleted {
        use super::*;

        #[tokio::test]
        async fn stops_block_stream_and_executor() {
            let config = IndexerConfig::default();
            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version()),
                enabled: false,
                provisioned_state: ProvisionedState::Deprovisioning {
                    task_id: "task_id".to_string(),
                },
            };
            let executor = ExecutorInfo {
                executor_id: "executor_id".to_string(),
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                version: config.get_registry_version(),
                status: "running".to_string(),
            };
            let block_stream = StreamInfo {
                stream_id: "stream_id".to_string(),
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                version: config.get_registry_version(),
            };

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_stop()
                .with(eq("stream_id".to_string()))
                .returning(|_| Ok(()))
                .once();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler
                .expect_stop()
                .with(eq("executor_id".to_string()))
                .returning(|_| Ok(()))
                .once();

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_delete_state().never();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_get_task_status()
                .with(eq("task_id".to_string()))
                .returning(|_| Ok(TaskStatus::Pending));

            let registry = Registry::default();
            let redis_client = RedisClient::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_deleted_indexer(&state, Some(&executor), Some(&block_stream))
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn cleans_indexer_resources() {
            let config = IndexerConfig::default();
            let provisioned_state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version()),
                enabled: false,
                provisioned_state: ProvisionedState::Provisioned,
            };
            let deprovisioning_state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version()),
                enabled: false,
                provisioned_state: ProvisionedState::Deprovisioning {
                    task_id: "task_id".to_string(),
                },
            };

            let mut state_manager = IndexerStateManager::default();
            state_manager
                .expect_set_deprovisioning()
                .with(eq(provisioned_state.clone()), eq("task_id".to_string()))
                .returning(|_, _| Ok(()));
            state_manager
                .expect_delete_state()
                .with(eq(deprovisioning_state.clone()))
                .returning(|_| Ok(()))
                .once();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_start_deprovisioning_task()
                .with(
                    eq(config.clone().account_id),
                    eq(config.clone().function_name),
                )
                .returning(|_, _| Ok("task_id".to_string()));
            data_layer_handler
                .expect_get_task_status()
                .with(eq("task_id".to_string()))
                .returning(|_| Ok(TaskStatus::Complete));

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_del::<String>()
                .with(eq(config.get_redis_stream_key()))
                .returning(|_| Ok(()))
                .once();

            let registry = Registry::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser
                .sync_deleted_indexer(&provisioned_state, None, None)
                .await
                .unwrap();
            synchroniser
                .sync_deleted_indexer(&deprovisioning_state, None, None)
                .await
                .unwrap();
        }
    }
}
