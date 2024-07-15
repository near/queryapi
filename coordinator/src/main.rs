// TODO
// - [ ] Ensure all states are appropriate, i.e. do we need both Deprovisioning and Deleting?
// - [ ] Fully implement state handling, i.e. block stream/executor synchronisation
// - [ ] Spawn lifecycle tasks from `main()`
// - [ ] Extract client from handlers to make mocking/testing easier? is handler the best place for
// those higher level methods
// - [ ] Introduce typestate?
// - [ ] tests

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use near_primitives::types::AccountId;
use tokio::task::JoinHandle;
use tracing_subscriber::prelude::*;

use crate::handlers::block_streams::BlockStreamsHandler;
use crate::handlers::data_layer::DataLayerHandler;
use crate::handlers::executors::ExecutorsHandler;
use crate::indexer_state::IndexerStateManager;
use crate::lifecycle::LifecycleManager;
use crate::redis::RedisClient;
use crate::registry::Registry;
use crate::synchroniser::Synchroniser;

mod handlers;
mod indexer_config;
mod indexer_state;
mod lifecycle;
mod redis;
mod registry;
mod server;
mod synchroniser;
mod utils;

const LOOP_THROTTLE_SECONDS: Duration = Duration::from_secs(1);

async fn sleep(duration: Duration) -> anyhow::Result<()> {
    tokio::time::sleep(duration).await;

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let rpc_url = std::env::var("RPC_URL").expect("RPC_URL is not set");
    let registry_contract_id = std::env::var("REGISTRY_CONTRACT_ID")
        .expect("REGISTRY_CONTRACT_ID is not set")
        .parse::<AccountId>()
        .expect("REGISTRY_CONTRACT_ID is not a valid account ID");
    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL is not set");
    let block_streamer_url =
        std::env::var("BLOCK_STREAMER_URL").expect("BLOCK_STREAMER_URL is not set");
    let runner_url = std::env::var("RUNNER_URL").expect("RUNNER_URL is not set");
    let grpc_port = std::env::var("GRPC_PORT").expect("GRPC_PORT is not set");

    tracing::info!(
        rpc_url,
        registry_contract_id = registry_contract_id.as_str(),
        block_streamer_url,
        runner_url,
        redis_url,
        "Starting Coordinator"
    );

    let registry = Arc::new(Registry::connect(registry_contract_id.clone(), &rpc_url));
    let redis_client = RedisClient::connect(&redis_url).await?;
    let block_streams_handler =
        BlockStreamsHandler::connect(&block_streamer_url, redis_client.clone())?;
    let executors_handler = ExecutorsHandler::connect(&runner_url)?;
    let data_layer_handler = DataLayerHandler::connect(&runner_url)?;
    let indexer_state_manager = Arc::new(IndexerStateManager::new(redis_client.clone()));

    tokio::spawn({
        let indexer_state_manager = indexer_state_manager.clone();
        let registry = registry.clone();
        async move { server::init(grpc_port, indexer_state_manager, registry).await }
    });

    // handle removal
    let mut lifecycle_tasks = HashMap::<String, JoinHandle<()>>::new();

    loop {
        let indexer_registry = registry.fetch().await?;

        for config in indexer_registry.iter() {
            if lifecycle_tasks.contains_key(&config.get_full_name()) {
                continue;
            }

            let handle = tokio::spawn({
                let indexer_state_manager = indexer_state_manager.clone();
                let config = config.clone();
                let registry = registry.clone();
                let redis_client = redis_client.clone();
                let block_streams_handler = block_streams_handler.clone();
                let data_layer_handler = data_layer_handler.clone();
                let executors_handler = executors_handler.clone();

                async move {
                    let lifecycle_manager = LifecycleManager::new(
                        config,
                        &block_streams_handler,
                        &executors_handler,
                        &data_layer_handler,
                        &registry,
                        &indexer_state_manager,
                        &redis_client,
                    );

                    lifecycle_manager.run().await
                }
            });

            lifecycle_tasks.insert(config.get_full_name(), handle);
        }

        sleep(LOOP_THROTTLE_SECONDS).await?;
    }
}
