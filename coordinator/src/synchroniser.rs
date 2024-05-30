use crate::{
    block_streams::BlockStreamsHandler, executors::ExecutorsHandler,
    indexer_state::IndexerStateManager, redis::RedisClient, registry::Registry,
};

pub struct Synchroniser<'a> {
    block_streams_handler: &'a BlockStreamsHandler,
    executors_handler: &'a ExecutorsHandler,
    registry: &'a Registry,
    state_manager: &'a IndexerStateManager,
    redis_client: &'a RedisClient,
}

impl<'a> Synchroniser<'a> {
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
}
