use near_jsonrpc_client::JsonRpcClient;
use tracing_subscriber::prelude::*;

use crate::indexer_config::IndexerConfig;
use crate::rules::types::indexer_rule_match::ChainId;
use crate::rules::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

mod block_streamer;
mod indexer_config;
mod redis;
mod rules;
mod s3;
mod s3_client;

pub(crate) const LOG_TARGET: &str = "block_streamer";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tracing::info!("Starting {}", crate::LOG_TARGET);

    let json_rpc_client = JsonRpcClient::connect("https://archival-rpc.mainnet.near.org");
    let redis_connection_manager = redis::connect("redis://127.0.0.1").await?;

    let aws_config = aws_config::from_env().load().await;
    let s3_client = aws_sdk_s3::Client::new(&aws_config);

    let contract = "queryapi.dataplatform.near";
    let matching_rule = MatchingRule::ActionAny {
        affected_account_id: contract.to_string(),
        status: Status::Any,
    };
    let filter_rule = IndexerRule {
        indexer_rule_kind: IndexerRuleKind::Action,
        matching_rule,
        id: None,
        name: None,
    };
    let indexer = IndexerConfig {
        account_id: "buildnear.testnet".to_string().parse().unwrap(),
        function_name: "index_stuff".to_string(),
        code: "".to_string(),
        start_block_height: Some(85376002),
        schema: None,
        provisioned: false,
        indexer_rule: filter_rule,
    };

    let mut streamer = block_streamer::BlockStreamer::new();

    streamer.start(
        106000000,
        indexer,
        redis_connection_manager,
        s3_client,
        ChainId::Mainnet,
        json_rpc_client,
    )?;

    streamer.take_handle().unwrap().await??;

    println!("done");

    Ok(())
}
