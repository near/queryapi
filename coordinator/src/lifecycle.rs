use near_primitives::types::AccountId;

use crate::handlers::block_streams::{BlockStreamsHandler, StreamInfo};
use crate::handlers::data_layer::{DataLayerHandler, TaskStatus};
use crate::handlers::executors::{ExecutorInfo, ExecutorsHandler};
use crate::indexer_config::IndexerConfig;
use crate::indexer_state::{IndexerState, IndexerStateManager, ProvisionedState};
use crate::redis::RedisClient;
use crate::registry::Registry;

const LOOP_THROTTLE_MS: u64 = 500;

// is there a way to map the transitions in this type?
#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum LifecycleStates {
    // are these too specific? e.g. should deprovisioning happen within deleting?
    #[default]
    Provisioning,
    Running,
    Stopping,
    Stopped,
    // this is kinda the same as deleting, do we need it?
    Deprovisioning,
    Erroring,
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

    async fn handle_provisioning(
        &self,
        config: &IndexerConfig,
        _state: &IndexerState,
    ) -> LifecycleStates {
        if self
            .data_layer_handler
            .ensure_provisioned(config)
            .await
            .is_err()
        {
            return LifecycleStates::Erroring;
        }

        LifecycleStates::Running
    }

    async fn handle_running(
        &self,
        config: &IndexerConfig,
        state: &IndexerState,
    ) -> LifecycleStates {
        if !state.enabled {
            return LifecycleStates::Stopping;
        }

        if self
            .block_streams_handler
            .synchronise_block_stream(config, state.block_stream_synced_at)
            .await
            .is_err()
        {
            return LifecycleStates::Erroring;
        }

        if self
            .executors_handler
            .synchronise_executor(config)
            .await
            .is_err()
        {
            return LifecycleStates::Erroring;
        }

        LifecycleStates::Running
    }

    async fn handle_stopping(&self, config: &IndexerConfig) -> LifecycleStates {
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

        LifecycleStates::Stopped
    }

    async fn handle_stopped(&self, state: &IndexerState) -> LifecycleStates {
        // check if config update?

        if state.enabled {
            return LifecycleStates::Running;
        }

        LifecycleStates::Stopped
    }

    async fn handle_deprovisioning(&self) -> LifecycleStates {
        LifecycleStates::Deprovisioning
    }

    async fn handle_erroring(
        &self,
        config: &IndexerConfig,
        state: &IndexerState,
    ) -> LifecycleStates {
        // check for update
        if config.get_registry_version() != state.block_stream_synced_at.unwrap() {
            return LifecycleStates::Running;
        }

        LifecycleStates::Erroring
    }

    async fn handle_deleting(&self, state: &IndexerState) -> LifecycleStates {
        if self
            .data_layer_handler
            .ensure_deprovisioned(state.account_id.clone(), state.function_name.clone())
            .await
            .is_err()
        {
            return LifecycleStates::Erroring;
        }

        // remove redis state

        LifecycleStates::Deleted
    }

    // should _not_ return a result here, all errors should be handled internally
    pub async fn run(&self) -> anyhow::Result<()> {
        loop {
            let config = self
                .registry
                .fetch_indexer(&self.account_id, &self.function_name)
                .await?;
            let mut state = self
                .state_manager
                .get_state(&config.clone().unwrap())
                .await?;

            state.lifecycle = if let Some(config) = config.clone() {
                match state.lifecycle {
                    LifecycleStates::Provisioning => {
                        self.handle_provisioning(&config, &state).await
                    }
                    LifecycleStates::Running => self.handle_running(&config, &state).await,
                    LifecycleStates::Stopping => self.handle_stopping(&config).await,
                    LifecycleStates::Stopped => self.handle_stopped(&state).await,
                    LifecycleStates::Deprovisioning => self.handle_deprovisioning().await,
                    LifecycleStates::Erroring => self.handle_erroring(&config, &state).await,
                    LifecycleStates::Deleting => unreachable!("handled below"),
                    LifecycleStates::Deleted => break,
                }
            } else {
                self.handle_deleting(&state).await
            };

            // only set if not deleting
            self.state_manager
                .set_state(&config.unwrap(), state)
                .await?;

            tokio::time::sleep(std::time::Duration::from_millis(LOOP_THROTTLE_MS)).await;
        }

        Ok(())
    }
}
