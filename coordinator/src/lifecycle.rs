use tracing::{info, warn};

use crate::handlers::block_streams::BlockStreamsHandler;
use crate::handlers::data_layer::DataLayerHandler;
use crate::handlers::executors::ExecutorsHandler;
use crate::indexer_config::IndexerConfig;
use crate::indexer_state::{IndexerState, IndexerStateManager};
use crate::redis::{KeyProvider, RedisClient};
use crate::registry::Registry;

const LOOP_THROTTLE_MS: u64 = 1000;

/// Represents the different lifecycle states of an Indexer
#[derive(Default, Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub enum LifecycleState {
    /// Pre-requisite resources, i.e. Data Layer are being created.
    ///
    /// Transitions:
    /// - `Running` on success
    /// - `Repairing` on Data Layer provisioning failure
    #[default]
    Initializing,
    /// Indexer is functional, Block Stream and Executors are continouously monitored to ensure
    /// they are running the latest version of the Indexer.
    ///
    /// Transitions:
    /// - `Suspending` if suspended
    /// - `Running` if Block Stream or Executor fails to synchronise, essentially triggering a
    /// retry
    /// - `Running` on success
    Running,
    /// Indexer is being suspended, Block Stream and Executors are being stopped.
    ///
    /// Transitions:
    /// - `Suspending` on failure, triggering a retry
    /// - `Suspended` on success
    Suspending,
    /// Indexer is suspended, Block Stream and Executors are not running.
    ///
    /// Transitions:
    /// - `Running` if unsuspended
    Suspended,
    /// Indexer is in a bad state, currently requires manual intervention, but should eventually
    /// self heal. This is a dead-end state
    ///
    /// Transitions:
    /// - `Repairing` continuously
    Repairing, // TODO Add `error` to enable reparation
    /// Indexer is being deleted, all resources are being cleaned up
    ///
    /// Transitions:
    /// - `Deleting` on failure, triggering a retry
    /// - `Deleted` on success
    Deleting,
    /// Indexer is deleted, all resources are cleaned up, lifecycle manager will exit
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
        if config.is_deleted() {
            return LifecycleState::Deleting;
        }

        if self
            .data_layer_handler
            .ensure_provisioned(config)
            .await
            .is_err()
        {
            tracing::warn!("Failed to provision data layer");
            return LifecycleState::Repairing;
        }

        LifecycleState::Running
    }

    #[tracing::instrument(name = "running", skip_all)]
    async fn handle_running(
        &self,
        config: &IndexerConfig,
        state: &mut IndexerState,
    ) -> LifecycleState {
        if config.is_deleted() {
            return LifecycleState::Deleting;
        }

        if !state.enabled {
            return LifecycleState::Suspending;
        }

        if let Err(error) = self
            .block_streams_handler
            .synchronise(config, state.block_stream_synced_at)
            .await
        {
            warn!(?error, "Failed to synchronise block stream, retrying...");
            return LifecycleState::Running;
        }

        state.block_stream_synced_at = Some(config.get_registry_version());

        if let Err(error) = self.executors_handler.synchronise(config).await {
            warn!(?error, "Failed to synchronise executor, retrying...");
            return LifecycleState::Running;
        }

        LifecycleState::Running
    }

    #[tracing::instrument(name = "suspending", skip_all)]
    async fn handle_suspending(&self, config: &IndexerConfig) -> LifecycleState {
        if config.is_deleted() {
            return LifecycleState::Deleting;
        }

        if let Err(error) = self
            .block_streams_handler
            .stop_if_needed(config.account_id.clone(), config.function_name.clone())
            .await
        {
            warn!(?error, "Failed to stop block stream, retrying...");
            return LifecycleState::Suspending;
        }

        if let Err(error) = self
            .executors_handler
            .stop_if_needed(config.account_id.clone(), config.function_name.clone())
            .await
        {
            warn!(?error, "Failed to stop executor, retrying...");
            return LifecycleState::Suspending;
        }

        LifecycleState::Suspended
    }

    #[tracing::instrument(name = "suspended", skip_all)]
    async fn handle_suspended(
        &self,
        config: &IndexerConfig,
        state: &IndexerState,
    ) -> LifecycleState {
        if config.is_deleted() {
            return LifecycleState::Deleting;
        }

        // TODO Transistion to `Running` on config update

        if state.enabled {
            tracing::debug!("Suspended indexer was reactivated");
            return LifecycleState::Running;
        }

        LifecycleState::Suspended
    }

    #[tracing::instrument(name = "repairing", skip_all)]
    async fn handle_repairing(
        &self,
        config: &IndexerConfig,
        _state: &IndexerState,
    ) -> LifecycleState {
        if config.is_deleted() {
            return LifecycleState::Deleting;
        }

        // TODO Add more robust error handling, for now just stop
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

        tracing::error!("Temporarily preventing indexer deprovision due to service instability");
        LifecycleState::Deleted

        // if self.state_manager.delete_state(state).await.is_err() {
        //     // Retry
        //     return LifecycleState::Deleting;
        // }
        //
        // info!("Clearing block stream");
        //
        // if self
        //     .redis_client
        //     .del(state.get_redis_stream_key())
        //     .await
        //     .is_err()
        // {
        //     // Retry
        //     return LifecycleState::Deleting;
        // }
        //
        // if self
        //     .data_layer_handler
        //     .ensure_deprovisioned(state.account_id.clone(), state.function_name.clone())
        //     .await
        //     .is_err()
        // {
        //     return LifecycleState::Deleted;
        // }
        //
        // LifecycleState::Deleted
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
                Ok(Some(config)) => config,
                Ok(None) => {
                    warn!("No matching indexer config was found");
                    continue;
                }
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

            let desired_lifecycle_state = match state.lifecycle_state {
                LifecycleState::Initializing => self.handle_initializing(&config, &state).await,
                LifecycleState::Running => self.handle_running(&config, &mut state).await,
                LifecycleState::Suspending => self.handle_suspending(&config).await,
                LifecycleState::Suspended => self.handle_suspended(&config, &state).await,
                LifecycleState::Repairing => self.handle_repairing(&config, &state).await,
                LifecycleState::Deleting => self.handle_deleting(&state).await,
                LifecycleState::Deleted => LifecycleState::Deleted,
            };

            if desired_lifecycle_state != state.lifecycle_state {
                info!(
                    "Transitioning lifecycle state: {:?} -> {:?}",
                    state.lifecycle_state, desired_lifecycle_state,
                );
            }

            if desired_lifecycle_state == LifecycleState::Deleted {
                break;
            }

            state.lifecycle_state = desired_lifecycle_state;

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
