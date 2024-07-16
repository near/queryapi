use tracing::{info, warn};

use crate::handlers::block_streams::BlockStreamsHandler;
use crate::handlers::data_layer::DataLayerHandler;
use crate::handlers::executors::ExecutorsHandler;
use crate::indexer_config::IndexerConfig;
use crate::indexer_state::{IndexerState, IndexerStateManager};
use crate::redis::{KeyProvider, RedisClient};
use crate::registry::Registry;

const LOOP_THROTTLE_MS: u64 = 1000;

#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum LifecycleState {
    #[default]
    Initializing,
    Running,
    Stopping,
    Stopped,
    Repairing, // TODO Add `error` to enable reparation
    Deleting,
    Deleted,
}

pub struct LifecycleManager<'a> {
    initial_config: IndexerConfig,
    block_streams_handler: &'a BlockStreamsHandler,
    executors_handler: &'a ExecutorsHandler,
    data_layer_handler: &'a DataLayerHandler,
    registry: &'a Registry,
    state_manager: &'a IndexerStateManager,
    redis_client: &'a RedisClient,
}

impl<'a> LifecycleManager<'a> {
    pub fn new(
        initial_config: IndexerConfig,
        block_streams_handler: &'a BlockStreamsHandler,
        executors_handler: &'a ExecutorsHandler,
        data_layer_handler: &'a DataLayerHandler,
        registry: &'a Registry,
        state_manager: &'a IndexerStateManager,
        redis_client: &'a RedisClient,
    ) -> Self {
        Self {
            initial_config,
            block_streams_handler,
            executors_handler,
            data_layer_handler,
            registry,
            state_manager,
            redis_client,
        }
    }

    #[tracing::instrument(name = "initializing", skip_all)]
    async fn handle_initializing(
        &self,
        config: &IndexerConfig,
        _state: &IndexerState,
    ) -> LifecycleState {
        if self
            .data_layer_handler
            .ensure_provisioned(config)
            .await
            .is_err()
        {
            return LifecycleState::Repairing;
        }

        LifecycleState::Running
    }

    #[tracing::instrument(name = "running", skip_all)]
    async fn handle_running(&self, config: &IndexerConfig, state: &IndexerState) -> LifecycleState {
        if !state.enabled {
            return LifecycleState::Stopping;
        }

        if let Err(error) = self
            .block_streams_handler
            .synchronise_block_stream(config, state.block_stream_synced_at)
            .await
        {
            warn!(?error, "Failed to synchronise block stream, retrying...");

            return LifecycleState::Running;
        }

        if let Err(error) = self.executors_handler.synchronise_executor(config).await {
            warn!(?error, "Failed to synchronise executor, retrying...");

            return LifecycleState::Running;
        }

        LifecycleState::Running
    }

    #[tracing::instrument(name = "stopping", skip_all)]
    async fn handle_stopping(&self, config: &IndexerConfig) -> LifecycleState {
        if let Err(error) = self
            .block_streams_handler
            .stop_if_needed(config.account_id.clone(), config.function_name.clone())
            .await
        {
            warn!(?error, "Failed to stop block stream, retrying...");
            return LifecycleState::Stopping;
        }

        if let Err(error) = self
            .executors_handler
            .stop_if_needed(config.account_id.clone(), config.function_name.clone())
            .await
        {
            warn!(?error, "Failed to stop executor, retrying...");
            return LifecycleState::Stopping;
        }

        LifecycleState::Stopped
    }

    #[tracing::instrument(name = "stopped", skip_all)]
    async fn handle_stopped(&self, state: &IndexerState) -> LifecycleState {
        // TODO Transistion to `Running` on config update

        if state.enabled {
            return LifecycleState::Running;
        }

        LifecycleState::Stopped
    }

    #[tracing::instrument(name = "repairing", skip_all)]
    async fn handle_repairing(
        &self,
        _config: &IndexerConfig,
        _state: &IndexerState,
    ) -> LifecycleState {
        // TODO Add more robust error handling, for now attempt to continue
        LifecycleState::Repairing
    }

    #[tracing::instrument(name = "deleting", skip_all)]
    async fn handle_deleting(&self, state: &IndexerState) -> LifecycleState {
        if let Err(error) = self
            .block_streams_handler
            .stop_if_needed(state.account_id.clone(), state.function_name.clone())
            .await
        {
            warn!(?error, "Failed to stop block stream");
        }

        if let Err(error) = self
            .executors_handler
            .stop_if_needed(state.account_id.clone(), state.function_name.clone())
            .await
        {
            warn!(?error, "Failed to stop executor");
        }

        if self.state_manager.delete_state(state).await.is_err() {
            // Retry
            return LifecycleState::Deleting;
        }

        if self
            .redis_client
            .del(state.get_redis_stream_key())
            .await
            .is_err()
        {
            // Retry
            return LifecycleState::Deleting;
        }

        if self
            .data_layer_handler
            .ensure_deprovisioned(state.account_id.clone(), state.function_name.clone())
            .await
            .is_err()
        {
            return LifecycleState::Deleted;
        }

        LifecycleState::Deleted
    }

    #[tracing::instrument(
        name = "lifecycle_manager",
        skip(self),
        fields(
            account_id = self.initial_config.account_id.as_str(),
            function_name = self.initial_config.function_name.as_str()
        )
    )]
    pub async fn run(&self) {
        let mut first_iteration = true;

        loop {
            tokio::time::sleep(std::time::Duration::from_millis(LOOP_THROTTLE_MS)).await;

            let config = match self
                .registry
                .fetch_indexer(
                    &self.initial_config.account_id,
                    &self.initial_config.function_name,
                )
                .await
            {
                Ok(config) => config,
                Err(error) => {
                    warn!(?error, "Failed to fetch config");
                    continue;
                }
            };

            let mut state = match self.state_manager.get_state(&self.initial_config).await {
                Ok(state) => state,
                Err(error) => {
                    warn!(?error, "Failed to get state");
                    continue;
                }
            };

            if first_iteration {
                info!("Initial lifecycle state: {:?}", state.lifecycle_state,);
                first_iteration = false;
            }

            let next_lifecycle_state = if let Some(config) = config.clone() {
                match state.lifecycle_state {
                    LifecycleState::Initializing => self.handle_initializing(&config, &state).await,
                    LifecycleState::Running => self.handle_running(&config, &state).await,
                    LifecycleState::Stopping => self.handle_stopping(&config).await,
                    LifecycleState::Stopped => self.handle_stopped(&state).await,
                    LifecycleState::Repairing => self.handle_repairing(&config, &state).await,
                    LifecycleState::Deleting => unreachable!("handled below"),
                    LifecycleState::Deleted => break,
                }
            } else {
                self.handle_deleting(&state).await
            };

            if next_lifecycle_state != state.lifecycle_state {
                info!(
                    "Transitioning lifecycle state: {:?} -> {:?}",
                    state.lifecycle_state, next_lifecycle_state,
                );
            }

            state.lifecycle_state = next_lifecycle_state;

            loop {
                match self
                    .state_manager
                    .set_state(&self.initial_config, state.clone())
                    .await
                {
                    Ok(_) => break,
                    Err(e) => {
                        warn!("Failed to set state: {:?}. Retrying...", e);

                        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                    }
                }
            }
        }
    }
}
