use near_jsonrpc_client::JsonRpcClient;

mod block_stream_handler;
mod redis;
mod registry;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let json_rpc_client = JsonRpcClient::connect("https://rpc.mainnet.near.org");
    let redis_client = redis::RedisClient::connect("redis://127.0.0.1").await?;
    let mut block_stream_handler = block_stream_handler::BlockStreamHandler::connect().await?;

    let registry = registry::fetch_registry(&json_rpc_client).await?;

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
