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
