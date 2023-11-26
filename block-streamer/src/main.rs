use tracing_subscriber::prelude::*;

// use crate::indexer_config::IndexerConfig;
// use crate::rules::types::indexer_rule_match::ChainId;
// use crate::rules::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

use std::sync::Arc;

use routeguide::route_guide_server::RouteGuideServer;
use tonic::transport::Server;

mod block_stream;
mod data;
mod delta_lake_client;
mod indexer_config;
mod redis;
mod rules;
mod s3_client;
mod server;

pub mod routeguide {
    tonic::include_proto!("routeguide");
}

pub(crate) const LOG_TARGET: &str = "block_streamer";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tracing::info!("Starting {}", crate::LOG_TARGET);

    let addr = "[::1]:10000".parse().unwrap();

    println!("RouteGuideServer listening on: {}", addr);

    let route_guide = crate::server::RouteGuideService {
        features: Arc::new(data::load()),
    };

    let svc = RouteGuideServer::new(route_guide);

    Server::builder().add_service(svc).serve(addr).await?;

    Ok(())

    // let redis_connection_manager = redis::connect("redis://127.0.0.1").await?;
    //
    // let aws_config = aws_config::from_env().load().await;
    // let s3_client = crate::s3_client::S3Client::new(&aws_config);
    //
    // let delta_lake_client = crate::delta_lake_client::DeltaLakeClient::new(s3_client);
    //
    // let contract = "queryapi.dataplatform.near";
    // let matching_rule = MatchingRule::ActionAny {
    //     affected_account_id: contract.to_string(),
    //     status: Status::Any,
    // };
    // let filter_rule = IndexerRule {
    //     indexer_rule_kind: IndexerRuleKind::Action,
    //     matching_rule,
    //     id: None,
    //     name: None,
    // };
    // let indexer = IndexerConfig {
    //     account_id: "buildnear.testnet".to_string().parse().unwrap(),
    //     function_name: "index_stuff".to_string(),
    //     code: "".to_string(),
    //     start_block_height: Some(85376002),
    //     schema: None,
    //     provisioned: false,
    //     indexer_rule: filter_rule,
    // };
    //
    // let mut streamer = block_stream::BlockStream::new();
    //
    // streamer.start(
    //     106000000,
    //     indexer,
    //     redis_connection_manager,
    //     delta_lake_client,
    //     ChainId::Mainnet,
    // )?;
    //
    // streamer.take_handle().unwrap().await??;
    //
    // println!("done");
    //
    // Ok(())
}
