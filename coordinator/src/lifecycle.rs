use near_primitives::types::AccountId;

use crate::handlers::block_streams::BlockStreamsHandler;
use crate::handlers::data_layer::DataLayerHandler;
use crate::handlers::executors::ExecutorsHandler;
use crate::indexer_config::IndexerConfig;
use crate::indexer_state::{IndexerState, IndexerStateManager};
use crate::redis::RedisClient;
use crate::registry::Registry;

const LOOP_THROTTLE_MS: u64 = 500;

#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum LifecycleState {
    #[default]
    Initializing,
    Running,
    Stopping,
    Stopped,
    Repairing,
    Deleting,
    Deleted,
}

pub struct LifecycleManager<'a> {
    account_id: AccountId,
    function_name: String,
    block_streams_handler: &'a BlockStreamsHandler,
    executors_handler: &'a ExecutorsHandler,
    data_layer_handler: &'a DataLayerHandler,
    registry: &'a Registry,
    state_manager: &'a IndexerStateManager,
    redis_client: &'a RedisClient,
}

impl<'a> LifecycleManager<'a> {
    #[allow(clippy::too_many_arguments)]
    fn new(
        account_id: AccountId,
        function_name: String,
        block_streams_handler: &'a BlockStreamsHandler,
        executors_handler: &'a ExecutorsHandler,
        data_layer_handler: &'a DataLayerHandler,
        registry: &'a Registry,
        state_manager: &'a IndexerStateManager,
        redis_client: &'a RedisClient,
    ) -> Self {
        Self {
            account_id,
            function_name,
            block_streams_handler,
            executors_handler,
            data_layer_handler,
            registry,
            state_manager,
            redis_client,
        }
    }

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

    async fn handle_running(&self, config: &IndexerConfig, state: &IndexerState) -> LifecycleState {
        if !state.enabled {
            return LifecycleState::Stopping;
        }

        if self
            .block_streams_handler
            .synchronise_block_stream(config, state.block_stream_synced_at)
            .await
            .is_err()
        {
            return LifecycleState::Repairing;
        }

        if self
            .executors_handler
            .synchronise_executor(config)
            .await
            .is_err()
        {
            return LifecycleState::Repairing;
        }

        LifecycleState::Running
    }

    async fn handle_stopping(&self, config: &IndexerConfig) -> LifecycleState {
        if let Some(block_stream) = self.block_streams_handler.get(config).await.unwrap() {
            self.block_streams_handler
                .stop(block_stream.stream_id)
                .await
                .unwrap();
        }

        if let Some(executor) = self.executors_handler.get(config).await.unwrap() {
            self.executors_handler
                .stop(executor.executor_id)
                .await
                .unwrap();
        }

        LifecycleState::Stopped
    }

    async fn handle_stopped(&self, state: &IndexerState) -> LifecycleState {
        // TODO Transistion to `Running` on config update

        if state.enabled {
            return LifecycleState::Running;
        }

        LifecycleState::Stopped
    }

    async fn handle_repairing(
        &self,
        _config: &IndexerConfig,
        _state: &IndexerState,
    ) -> LifecycleState {
        // TODO Add more robust error handling, for now just stop
        LifecycleState::Stopping
    }

    async fn handle_deleting(&self, state: &IndexerState) -> LifecycleState {
        if self
            .data_layer_handler
            .ensure_deprovisioned(state.account_id.clone(), state.function_name.clone())
            .await
            .is_err()
        {
            return LifecycleState::Repairing;
        }

        // remove redis state

        LifecycleState::Deleted
    }

    // should _not_ return a result here, all errors should be handled internally
    pub async fn run(&self) -> anyhow::Result<()> {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(LOOP_THROTTLE_MS)).await;

            let config = self
                .registry
                .fetch_indexer(&self.account_id, &self.function_name)
                .await?;
            let mut state = self
                .state_manager
                .get_state(&config.clone().unwrap())
                .await?;

            let next_lifecycle_state = if let Some(config) = config.clone() {
                match state.lifecycle {
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

            state.lifecycle = next_lifecycle_state;

            // only set if not deleting
            self.state_manager
                .set_state(&config.unwrap(), state)
                .await?;
        }

        Ok(())
    }
}
