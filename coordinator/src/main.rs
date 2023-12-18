use crate::block_stream_handler::BlockStreamHandler;
use crate::redis::RedisClient;
use crate::registry::Registry;

mod block_stream_handler;
mod redis;
mod registry;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let registry = Registry::connect("https://rpc.mainnet.near.org");
    let redis_client = RedisClient::connect("redis://127.0.0.1").await?;
    let mut block_stream_handler = BlockStreamHandler::connect().await?;

    map_registry_to_system(&registry, &redis_client, &mut block_stream_handler).await?;

    Ok(())
}

async fn map_registry_to_system(
    registry: &Registry,
    redis_client: &RedisClient,
    block_stream_handler: &mut BlockStreamHandler,
) -> anyhow::Result<()> {
    let registry = registry.fetch().await?;

    for indexers in registry.values() {
        for indexer_config in indexers.values() {
            let start_block_height = if let Some(start_block_height) =
                indexer_config.start_block_height
            {
                start_block_height
            } else if let Ok(last_indexed_block) = redis_client
                .get::<String, u64>(format!(
                    "{}:last_indexed_block",
                    indexer_config.get_full_name()
                ))
                .await
            {
                last_indexed_block
            } else if let Some(updated_at_block_height) = indexer_config.updated_at_block_height {
                updated_at_block_height
            } else {
                indexer_config.created_at_block_height
            };

            block_stream_handler
                .start(
                    start_block_height,
                    indexer_config.account_id.to_string(),
                    indexer_config.function_name.clone(),
                    indexer_config.filter.matching_rule.clone(),
                )
                .await?;
        }
    }

    Ok(())
}
