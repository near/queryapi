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
    /// - `Stopping` if suspended
    /// - `Running` if Block Stream or Executor fails to synchronise, essentially triggering a
    /// retry
    /// - `Running` on success
    Running,
    /// Indexer is being stopped, Block Stream and Executors are being stopped.
    ///
    /// Transitions:
    /// - `Stopping` on failure, triggering a retry
    /// - `Stopped` on success
    Stopping,
    /// Indexer is stopped, Block Stream and Executors are not running.
    ///
    /// Transitions:
    /// - `Running` if unsuspended
    Stopped,
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
            return LifecycleState::Stopping;
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

    #[tracing::instrument(name = "stopping", skip_all)]
    async fn handle_stopping(&self, config: &IndexerConfig) -> LifecycleState {
        if config.is_deleted() {
            return LifecycleState::Deleting;
        }

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
    async fn handle_stopped(&self, config: &IndexerConfig, state: &IndexerState) -> LifecycleState {
        if config.is_deleted() {
            return LifecycleState::Deleting;
        }

        // TODO Transistion to `Running` on config update

        if state.enabled {
            return LifecycleState::Running;
        }

        LifecycleState::Stopped
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

    pub async fn handle_transitions(&self, first_iteration: bool) -> bool {
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
                return false;
            }
            Err(error) => {
                warn!(?error, "Failed to fetch config");
                return false;
            }
        };

        let mut state = match self.state_manager.get_state(&self.initial_config).await {
            Ok(state) => state,
            Err(error) => {
                warn!(?error, "Failed to get state");
                return false;
            }
        };

        if first_iteration {
            info!("Initial lifecycle state: {:?}", state.lifecycle_state);
        }

        let desired_lifecycle_state = match state.lifecycle_state {
            LifecycleState::Initializing => self.handle_initializing(&config, &state).await,
            LifecycleState::Running => self.handle_running(&config, &mut state).await,
            LifecycleState::Stopping => self.handle_stopping(&config).await,
            LifecycleState::Stopped => self.handle_stopped(&config, &state).await,
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
            return true;
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

        false
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
            let should_exit = self.handle_transitions(first_iteration).await;

            if should_exit {
                break;
            }

            first_iteration = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use mockall::predicate::*;

    mod initializing {
        use super::*;

        #[tokio::test]
        async fn transitions_to_running_on_provisioning_success() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_ensure_provisioned()
                .returning(|_| Ok(()));

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Initializing,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Running
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn transitions_to_repairing_on_provisioning_failure() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_ensure_provisioned()
                .returning(|_| anyhow::bail!("failed"));

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Initializing,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Repairing
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn transitions_to_deleting_on_delete() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();

            let mut data_layer_handler = DataLayerHandler::default();
            data_layer_handler
                .expect_ensure_provisioned()
                .returning(|_| anyhow::bail!("failed"));

            let mut registry = Registry::default();
            registry.expect_fetch_indexer().returning(move |_, _| {
                Ok(Some(IndexerConfig {
                    deleted_at_block_height: Some(3),
                    ..Default::default()
                }))
            });

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Initializing,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleting
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }
    }

    mod running {
        use super::*;

        #[tokio::test]
        async fn transitions_to_deleting_on_delete() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry.expect_fetch_indexer().returning(move |_, _| {
                Ok(Some(IndexerConfig {
                    deleted_at_block_height: Some(3),
                    ..Default::default()
                }))
            });

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Running,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleting
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn transitions_to_stopping_on_disabled() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry.expect_fetch_indexer().returning(move |_, _| {
                Ok(Some(IndexerConfig {
                    deleted_at_block_height: Some(3),
                    ..Default::default()
                }))
            });

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Running,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: false,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleting
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn synchronises_streams_and_executors() {
            let config = IndexerConfig::default();

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_synchronise()
                .returning(|_, _| Ok(()))
                .once();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler
                .expect_synchronise()
                .returning(|_| Ok(()))
                .once();

            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Running,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Running
                            && state.block_stream_synced_at == Some(2)
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }
    }

    mod stopping {
        use super::*;

        #[tokio::test]
        async fn transitions_to_deleting_on_delete() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry.expect_fetch_indexer().returning(move |_, _| {
                Ok(Some(IndexerConfig {
                    deleted_at_block_height: Some(3),
                    ..Default::default()
                }))
            });

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Stopping,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleting
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn stops_streams_and_executors() {
            let config = IndexerConfig::default();

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_stop_if_needed()
                .returning(|_, _| Ok(()))
                .once();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler
                .expect_stop_if_needed()
                .returning(|_, _| Ok(()))
                .once();

            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Stopping,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Stopped
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }
    }

    mod stopped {
        use super::*;

        #[tokio::test]
        async fn transitions_to_deleting_on_delete() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry.expect_fetch_indexer().returning(move |_, _| {
                Ok(Some(IndexerConfig {
                    deleted_at_block_height: Some(3),
                    ..Default::default()
                }))
            });

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Stopped,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: false,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleting
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn transitions_to_running_on_enabled() {
            let config = IndexerConfig::default();

            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Stopped,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Running
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn transitions_to_stopped() {
            let config = IndexerConfig::default();

            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Stopped,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: false,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Stopped
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }
    }

    mod repairing {
        use super::*;

        #[tokio::test]
        async fn transitions_to_deleting_on_delete() {
            let config = IndexerConfig::default();
            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry.expect_fetch_indexer().returning(move |_, _| {
                Ok(Some(IndexerConfig {
                    deleted_at_block_height: Some(3),
                    ..Default::default()
                }))
            });

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Repairing,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleting
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }

        #[tokio::test]
        async fn transitions_to_repairing() {
            let config = IndexerConfig::default();

            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Repairing,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Repairing
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }
    }

    mod deleting {
        use super::*;

        #[tokio::test]
        async fn stops_streams_and_executors() {
            let config = IndexerConfig::default();

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler
                .expect_stop_if_needed()
                .returning(|_, _| Ok(()))
                .once();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler
                .expect_stop_if_needed()
                .returning(|_, _| Ok(()))
                .once();

            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Deleting,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleted
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.handle_transitions(true).await;
        }
    }

    mod deleted {
        use super::*;

        #[tokio::test]
        async fn exits() {
            tokio::time::pause();

            let config = IndexerConfig::default();

            let block_streams_handler = BlockStreamsHandler::default();
            let executors_handler = ExecutorsHandler::default();
            let data_layer_handler = DataLayerHandler::default();

            let mut registry = Registry::default();
            registry
                .expect_fetch_indexer()
                .returning(move |_, _| Ok(Some(IndexerConfig::default())));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_get_state().returning(|_| {
                Ok(IndexerState {
                    lifecycle_state: LifecycleState::Deleted,
                    account_id: "near".parse().unwrap(),
                    function_name: "function_name".to_string(),
                    enabled: true,
                    block_stream_synced_at: None,
                })
            });
            state_manager
                .expect_set_state()
                .with(
                    always(),
                    function(|state: &IndexerState| {
                        state.lifecycle_state == LifecycleState::Deleted
                    }),
                )
                .returning(|_, _| Ok(()));

            let redis_client = RedisClient::default();

            let lifecycle_manager = LifecycleManager::new(
                config,
                &block_streams_handler,
                &executors_handler,
                &data_layer_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            lifecycle_manager.run().await;
        }
    }
}
