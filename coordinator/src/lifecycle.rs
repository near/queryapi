use near_primitives::types::AccountId;

use crate::handlers::block_streams::{BlockStreamsHandler, StreamInfo};
use crate::handlers::data_layer::{DataLayerHandler, TaskStatus};
use crate::handlers::executors::{ExecutorInfo, ExecutorsHandler};
use crate::indexer_config::IndexerConfig;
use crate::indexer_state::{IndexerState, IndexerStateManager, ProvisionedState};
use crate::redis::RedisClient;
use crate::registry::Registry;

// is there a way to map the transitions in this type?
#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum Lifecycle {
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
    ) -> Lifecycle {
        if self
            .data_layer_handler
            .ensure_provisioned(config)
            .await
            .is_err()
        {
            return Lifecycle::Erroring;
        }

        Lifecycle::Running
    }

    async fn handle_running(&self, config: &IndexerConfig, state: &IndexerState) -> Lifecycle {
        if !state.enabled {
            return Lifecycle::Stopping;
        }

        // check if we need to reprovision

        // ensure_running()
        let block_stream = self.block_streams_handler.get(config).await.unwrap();
        if let Some(block_stream) = block_stream {
            if block_stream.version != config.get_registry_version() {
                self.block_streams_handler
                    .stop(block_stream.stream_id)
                    .await
                    .unwrap();
                self.block_streams_handler.start(0, config).await.unwrap();
            }
        } else {
            self.block_streams_handler.start(0, config).await.unwrap();
        }

        // ensure_running()
        let executor = self.executors_handler.get(config).await.unwrap();
        if let Some(executor) = executor {
            if executor.version != config.get_registry_version() {
                self.executors_handler
                    .stop(executor.executor_id)
                    .await
                    .unwrap();
                self.executors_handler.start(config).await.unwrap();
            }
        } else {
            self.executors_handler.start(config).await.unwrap();
        }

        Lifecycle::Running
    }

    async fn handle_stopping(&self, config: &IndexerConfig) -> Lifecycle {
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

        Lifecycle::Stopped
    }

    async fn handle_stopped(&self, state: &IndexerState) -> Lifecycle {
        // check if config update?

        if state.enabled {
            return Lifecycle::Running;
        }

        Lifecycle::Stopped
    }

    async fn handle_deprovisioning(&self) -> Lifecycle {
        Lifecycle::Deprovisioning
    }

    async fn handle_erroring(&self, config: &IndexerConfig, state: &IndexerState) -> Lifecycle {
        if config.get_registry_version() != state.block_stream_synced_at.unwrap() {
            return Lifecycle::Running;
        }

        Lifecycle::Erroring
    }

    async fn handle_deleting(&self, state: &IndexerState) -> Lifecycle {
        // ensure_deprovisioned
        let task_id = self
            .data_layer_handler
            .start_deprovisioning_task(state.account_id.clone(), state.function_name.clone())
            .await
            .unwrap();

        loop {
            let status = self
                .data_layer_handler
                .get_task_status(task_id.clone())
                .await
                .unwrap();

            if status == TaskStatus::Complete {
                break;
            }
        }

        Lifecycle::Deleted
    }

    // should not return a result here, all errors should be handled internally
    pub async fn run(&self) -> anyhow::Result<()> {
        // should throttle this
        loop {
            // this would be optional, and would decide the deleting state
            let config = Some(
                self.registry
                    .fetch_indexer(&self.account_id, &self.function_name)
                    .await?,
            );
            let mut state = self
                .state_manager
                .get_state(&config.clone().unwrap())
                .await?;

            state.lifecycle = if let Some(config) = config {
                match state.lifecycle {
                    Lifecycle::Provisioning => self.handle_provisioning(&config, &state).await,
                    Lifecycle::Running => self.handle_running(&config, &state).await,
                    Lifecycle::Stopping => self.handle_stopping(&config).await,
                    Lifecycle::Stopped => self.handle_stopped(&state).await,
                    Lifecycle::Deprovisioning => self.handle_deprovisioning().await,
                    Lifecycle::Erroring => self.handle_erroring(&config, &state).await,
                    Lifecycle::Deleting => unreachable!("handled below"),
                    Lifecycle::Deleted => break,
                }
            } else {
                self.handle_deleting(&state).await
            }

            // flush state
        }

        Ok(())
    }
}
