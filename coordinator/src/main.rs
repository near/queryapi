use std::sync::Arc;
use std::time::Duration;

use near_primitives::types::AccountId;
use tokio::time::sleep;
use tracing_subscriber::prelude::*;

use crate::block_streams::{synchronise_block_streams, BlockStreamsHandler};
use crate::executors::{synchronise_executors, ExecutorsHandler};
use crate::indexer_state::IndexerStateManager;
use crate::redis::RedisClient;
use crate::registry::Registry;

mod block_streams;
mod executors;
mod indexer_config;
mod indexer_state;
mod redis;
mod registry;
mod server;
mod utils;

const CONTROL_LOOP_THROTTLE_SECONDS: Duration = Duration::from_secs(1);

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
    let block_streams_handler = BlockStreamsHandler::connect(&block_streamer_url)?;
    let executors_handler = ExecutorsHandler::connect(&runner_url)?;
    let indexer_state_manager = Arc::new(IndexerStateManager::new(redis_client.clone()));

    tokio::spawn({
        let indexer_state_manager = indexer_state_manager.clone();
        let registry = registry.clone();
        async move { server::init(grpc_port, indexer_state_manager, registry).await }
    });

    loop {
        let indexer_registry = registry.fetch().await?;

        indexer_state_manager
            .migrate_state_if_needed(&indexer_registry)
            .await?;

        // NOTE Rather than filtering them here, we can pass `IndexerState` to the sync methods,
        // and let them decide what to do. That would be a bit cleaner?
        //
        // This will also allow us to determine when an Indexer has been deleted, rather than
        // implicitly relying on the existance of executors/block_streams. This is going to be
        // important for deprovisioning.
        let indexer_registry = indexer_state_manager
            .filter_disabled_indexers(&indexer_registry)
            .await?;

        tokio::try_join!(
            // NOTE this may need to be regactored in to a combined "synchronise" function.
            // The addition of DataLayer provisioning makes the process a bit more stateful, i.e.
            // we need to do provisioning first, wait till it completes, and can then kick off
            // executor/block_stream sync processes
            //
            // It's probably still helpful to encapsulate the block_stream/executor sync methods,
            // as they are quite involved, but call them from an overall synchronise method
            //
            // We'll need to store the `ProvisioningStatus` in Redis, so we know when to poll
            synchronise_executors(&indexer_registry, &executors_handler),
            synchronise_block_streams(
                &indexer_registry,
                &indexer_state_manager,
                &redis_client,
                &block_streams_handler
            ),
            async {
                sleep(CONTROL_LOOP_THROTTLE_SECONDS).await;
                Ok(())
            }
        )?;
    }
}
