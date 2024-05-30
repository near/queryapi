use registry_types::StartBlock;

use crate::{
    block_streams::BlockStreamsHandler,
    executors::ExecutorsHandler,
    indexer_config::IndexerConfig,
    indexer_state::IndexerStateManager,
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

    pub async fn sync_block_stream() {}
    pub async fn sync_executor() {}

    pub async fn handle_new_indexer(&self, config: &IndexerConfig) -> anyhow::Result<()> {
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

    pub async fn sync(&self) -> anyhow::Result<()> {
        let states = self.state_manager.list().await?;
        let mut registry = self.registry.fetch().await?;
        // TODO get instead of list?
        let executors = self.executors_handler.list().await?;
        let block_streams = self.block_streams_handler.list().await?;

        for state in states {
            let config = registry.get(&state.account_id, &state.function_name);
            let executor = executors.iter().find(|e| {
                e.account_id == state.account_id && e.function_name == state.function_name
            });
            let block_stream = block_streams.iter().find(|b| {
                b.account_id == state.account_id && b.function_name == state.function_name
            });

            if config.is_some() {
                registry.remove(&state.account_id, &state.function_name);
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

    #[tokio::test]
    async fn starts_new_indexer() {
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
            .returning(|_, _| Ok(()));
        block_streams_handler
            .expect_start()
            .with(eq(config2.get_registry_version()), eq(config2.clone()))
            .returning(|_, _| Ok(()));

        let mut executors_handler = ExecutorsHandler::default();
        executors_handler.expect_list().returning(|| Ok(vec![]));
        executors_handler
            .expect_start()
            .with(eq(config1))
            .returning(|_| Ok(()));
        executors_handler
            .expect_start()
            .with(eq(config2))
            .returning(|_| Ok(()));

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
