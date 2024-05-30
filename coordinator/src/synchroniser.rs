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

    async fn handle_new_indexer(&self, config: &IndexerConfig) -> anyhow::Result<()> {
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

        Ok(())
    }

    async fn sync_executor(
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

    async fn sync_block_stream(
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
        }

        //if let Some(previous_sync_height) = state.block_stream_synced_at {
        //    if previous_sync_height == config.get_registry_version() {
        //        return Ok(());
        //    }
        //}

        // TODO do we still need to check if it was previously synced? I think so because if block
        // streamer restarts we dont want to accidently clear the stream
        //if matches!(
        //    config.start_block,
        //    StartBlock::Latest | StartBlock::Height(..)
        //) {
        //    self.redis_client.clear_block_stream(config).await?;
        //}

        let height = match config.start_block {
            StartBlock::Latest => Ok(config.get_registry_version()),
            StartBlock::Height(height) => Ok(height),
            StartBlock::Continue => self
                .redis_client
                .get_last_published_block(config)
                .await?
                .map(|height| height + 1)
                .ok_or(anyhow::anyhow!("Indexer has no `last_published_block`")),
        }?;

        //let sync_status = self
        //    .state_manager
        //    .get_block_stream_sync_status(config)
        //    .await?;

        //clear_block_stream_if_needed(&sync_status, indexer_config, redis_client).await?;
        //
        //let start_block_height =
        //    determine_start_block_height(&sync_status, indexer_config, redis_client).await?;

        self.block_streams_handler.start(height, config).await?;

        //self.state_manager.set_block_stream_synced(config).await?;

        Ok(())
    }

    async fn handle_existing_indexer(
        &self,
        config: &IndexerConfig,
        // TODO handle disabled indexers
        state: &IndexerState,
        executor: Option<&ExecutorInfo>,
        block_stream: Option<&StreamInfo>,
    ) -> anyhow::Result<()> {
        self.sync_executor(config, executor).await?;
        self.sync_block_stream(config, state, block_stream).await?;

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

                self.handle_existing_indexer(&config, &state, executor, block_stream)
                    .await?;
                // handle_existing()
            } else {
                // handle_deleted()
            }
        }

        for config in registry.iter() {
            // shouldn't be any executor/block_stream
            self.handle_new_indexer(config).await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    use mockall::predicate::*;
    use std::collections::HashMap;

    mod new_indexer {
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

    mod existing_indexer {
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
    }
}
