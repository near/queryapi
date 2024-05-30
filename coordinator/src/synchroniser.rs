// TODO re-export these from handler
use block_streamer::StreamInfo;
use registry_types::StartBlock;
use runner::ExecutorInfo;

use crate::{
    block_streams::BlockStreamsHandler,
    executors::ExecutorsHandler,
    indexer_config::IndexerConfig,
    indexer_state::{IndexerState, IndexerStateManager},
    redis::RedisClient,
    registry::{IndexerRegistry, Registry},
};

pub struct Synchroniser<'a> {
    block_streams_handler: &'a BlockStreamsHandler,
    executors_handler: &'a ExecutorsHandler,
    registry: &'a Registry,
    state_manager: &'a IndexerStateManager,
    redis_client: &'a RedisClient,
}

impl<'a> Synchroniser<'a> {
    // TODO use builder?
    pub fn new(
        block_streams_handler: &'a BlockStreamsHandler,
        executors_handler: &'a ExecutorsHandler,
        registry: &'a Registry,
        state_manager: &'a IndexerStateManager,
        redis_client: &'a RedisClient,
    ) -> Self {
        Self {
            block_streams_handler,
            executors_handler,
            registry,
            state_manager,
            redis_client,
        }
    }

    async fn sync_new_indexer(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        self.executors_handler.start(config).await?;

        let start_block = match config.start_block {
            StartBlock::Height(height) => height,
            StartBlock::Latest => config.get_registry_version(),
            StartBlock::Continue => {
                tracing::warn!(
                    "Attempted to start new Block Stream with CONTINUE, using LATEST instead"
                );
                config.get_registry_version()
            }
        };

        self.block_streams_handler
            .start(start_block, config)
            .await?;

        // flush state

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

        tracing::info!("Starting new executor");

        self.executors_handler.start(config).await?;

        Ok(())
    }

    async fn get_continuation_block_height(&self, config: &IndexerConfig) -> anyhow::Result<u64> {
        self.redis_client
            .get_last_published_block(config)
            .await?
            .map(|height| height + 1)
            .ok_or(anyhow::anyhow!("Indexer has no `last_published_block`"))
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

        // TODO handle state which was written before indexer was registered
        if state.block_stream_synced_at.is_none()
            || state.block_stream_synced_at.unwrap() != config.get_registry_version()
        {
            self.reconfigure_block_stream(config).await?;

            return Ok(());
        }

        let height = self.get_continuation_block_height(config).await?;

        self.block_streams_handler.start(height, config).await?;

        Ok(())
    }

    async fn sync_existing_indexer(
        &self,
        config: &IndexerConfig,
        // TODO handle disabled indexers
        state: &IndexerState,
        executor: Option<&ExecutorInfo>,
        block_stream: Option<&StreamInfo>,
    ) -> anyhow::Result<()> {
        // TODO in parallel
        self.sync_existing_executor(config, executor).await?;
        self.sync_existing_block_stream(config, state, block_stream)
            .await?;

        // TODO flush state

        Ok(())
    }

    pub async fn sync(&self) -> anyhow::Result<()> {
        let states = self.state_manager.list().await?;
        let mut registry = self.registry.fetch().await?;
        // TODO get instead of list?
        let executors = self.executors_handler.list().await?;
        let block_streams = self.block_streams_handler.list().await?;

        for state in states {
            let config = registry
                .get(&state.account_id, &state.function_name)
                .cloned();
            let executor = executors.iter().find(|e| {
                e.account_id == state.account_id && e.function_name == state.function_name
            });
            let block_stream = block_streams.iter().find(|b| {
                b.account_id == state.account_id && b.function_name == state.function_name
            });

            if let Some(config) = config {
                registry.remove(&state.account_id, &state.function_name);

                self.sync_existing_indexer(&config, &state, executor, block_stream)
                    .await?;
                // handle_existing()
            } else {
                // handle_deleted()
            }
        }

        for config in registry.iter() {
            // shouldn't be any executor/block_stream
            self.sync_new_indexer(config).await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    use mockall::predicate::*;
    use std::collections::HashMap;

    mod new {
        use super::*;

        #[tokio::test]
        async fn start() {
            let config1 = IndexerConfig::default();
            let config2 = IndexerConfig {
                function_name: "test2".to_string(),
                start_block: StartBlock::Latest,
                ..Default::default()
            };

            let indexer_registry = IndexerRegistry::from(&[(
                config1.account_id.clone(),
                HashMap::from([
                    (config1.function_name.clone(), config1.clone()),
                    (config2.function_name.clone(), config2.clone()),
                ]),
            )]);

            let mut block_streams_handler = BlockStreamsHandler::default();
            block_streams_handler.expect_list().returning(|| Ok(vec![]));
            block_streams_handler
                .expect_start()
                .with(eq(100), eq(config1.clone()))
                .returning(|_, _| Ok(()))
                .once();
            block_streams_handler
                .expect_start()
                .with(eq(config2.get_registry_version()), eq(config2.clone()))
                .returning(|_, _| Ok(()))
                .once();

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_list().returning(|| Ok(vec![]));
            executors_handler
                .expect_start()
                .with(eq(config1))
                .returning(|_| Ok(()))
                .once();
            executors_handler
                .expect_start()
                .with(eq(config2))
                .returning(|_| Ok(()))
                .once();

            let mut registry = Registry::default();
            registry
                .expect_fetch()
                .returning(move || Ok(indexer_registry.clone()));

            let mut state_manager = IndexerStateManager::default();
            state_manager.expect_list().returning(|| Ok(vec![]));

            let redis_client = RedisClient::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
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
            state_manager.expect_list().returning(move || {
                Ok(vec![IndexerState {
                    account_id: config.account_id.clone(),
                    function_name: config.function_name.clone(),
                    block_stream_synced_at: Some(config.get_registry_version()),
                    enabled: true,
                }])
            });

            let redis_client = RedisClient::default();

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
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
            state_manager.expect_list().returning(move || {
                Ok(vec![IndexerState {
                    account_id: config.account_id.clone(),
                    function_name: config.function_name.clone(),
                    block_stream_synced_at: Some(config.get_registry_version()),
                    enabled: true,
                }])
            });

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
                &registry,
                &state_manager,
                &redis_client,
            );

            synchroniser.sync().await.unwrap();
        }

        #[tokio::test]
        async fn restarts_stopped_and_outdated_block_stream() {
            let config = IndexerConfig::default();
            let state = IndexerState {
                account_id: config.account_id.clone(),
                function_name: config.function_name.clone(),
                block_stream_synced_at: Some(config.get_registry_version() - 1),
                enabled: true,
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

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
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
            };

            let last_published_block = 1;

            let mut redis_client = RedisClient::default();
            redis_client.expect_clear_block_stream().never();
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

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
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

            let synchroniser = Synchroniser::new(
                &block_streams_handler,
                &executors_handler,
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
    }
}
