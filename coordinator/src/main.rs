use near_jsonrpc_client::JsonRpcClient;
use tonic::transport::channel::Channel;
use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{start_stream_request::Rule, ActionAnyRule, StartStreamRequest, Status};
use registry::IndexerConfig;

mod redis;
mod registry;

async fn start_stream(
    block_streamer_client: &mut BlockStreamerClient<Channel>,
    redis_client: &redis::RedisClient,
    indexer_config: &IndexerConfig,
) -> anyhow::Result<()> {
    let rule = match &indexer_config.filter.matching_rule {
        registry_types::MatchingRule::ActionAny {
            affected_account_id,
            status,
        } => Rule::ActionAnyRule(ActionAnyRule {
            affected_account_id: affected_account_id.to_owned(),
            status: match status {
                registry_types::Status::Success => Status::Success.into(),
                registry_types::Status::Fail => Status::Failure.into(),
                registry_types::Status::Any => Status::Any.into(),
            },
        }),
        _ => anyhow::bail!("Encountered unsupported indexer rule"),
    };

    let start_block_height = if let Some(start_block_height) = indexer_config.start_block_height {
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

    let _ = block_streamer_client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height,
            account_id: indexer_config.account_id.to_string(),
            function_name: indexer_config.function_name.to_string(),
            rule: Some(rule),
        }))
        .await?;

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let json_rpc_client = JsonRpcClient::connect("https://rpc.mainnet.near.org");
    let redis_client = redis::RedisClient::connect("redis://127.0.0.1").await?;
    let mut block_streamer_client = BlockStreamerClient::connect("http://[::1]:10000").await?;

    let registry = registry::fetch_registry(&json_rpc_client).await?;

    for indexers in registry.values() {
        for indexer_config in indexers.values() {
            start_stream(&mut block_streamer_client, &redis_client, indexer_config).await?;
        }
    }

    Ok(())
}
