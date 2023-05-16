use cached::SizedCache;
use futures::stream::{self, StreamExt};
use near_jsonrpc_client::JsonRpcClient;
use tokio::sync::Mutex;

use indexer_rules_engine::types::indexer_rule::{IndexerRule};
use indexer_rules_engine::types::indexer_rule_match::{ChainId};
use near_lake_framework::near_indexer_primitives::types;
use near_lake_framework::near_indexer_primitives::types::{AccountId, BlockHeight};

use indexer_types::{IndexerQueueMessage, IndexerRegistry};
use opts::{Opts, Parser};
use storage::ConnectionManager;

pub(crate) mod cache;
mod indexer_types;
mod indexer_registry;
mod indexer_reducer;
mod metrics;
mod opts;
mod utils;

pub(crate) const INDEXER: &str = "queryapi_coordinator";
pub(crate) const INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
pub(crate) const MAX_DELAY_TIME: std::time::Duration = std::time::Duration::from_millis(4000);
pub(crate) const RETRY_COUNT: usize = 2;

type SharedIndexerRegistry = std::sync::Arc<Mutex<IndexerRegistry>>;

#[derive(Debug, Default, Clone, Copy)]
pub struct BalanceDetails {
    pub non_staked: types::Balance,
    pub staked: types::Balance,
}

pub type BalanceCache = std::sync::Arc<Mutex<SizedCache<AccountId, BalanceDetails>>>;

pub(crate) struct QueryApiContext<'a> {
    pub streamer_message: near_lake_framework::near_indexer_primitives::StreamerMessage,
    pub chain_id: &'a ChainId,
    pub queue_client: &'a opts::QueueClient,
    pub queue_url: &'a str,
    pub registry_contract_id: &'a str,
    pub balance_cache: &'a BalanceCache,
    pub redis_connection_manager: &'a ConnectionManager,
    pub json_rpc_client: &'a JsonRpcClient,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    opts::init_tracing();

    opts::dotenv::dotenv().ok();

    let opts = Opts::parse();

    let chain_id = &opts.chain_id();
    let aws_region = opts.aws_queue_region.clone();
    let queue_client = &opts.queue_client(aws_region);
    let queue_url = opts.queue_url.clone();
    let registry_contract_id = opts.registry_contract_id.clone();

    // We want to prevent unnecessary RPC queries to find previous balance
    let balances_cache: BalanceCache =
        std::sync::Arc::new(Mutex::new(SizedCache::with_size(100_000)));

    tracing::info!(target: INDEXER, "Connecting to redis...");
    let redis_connection_manager = storage::connect(&opts.redis_connection_string).await?;

    let json_rpc_client = JsonRpcClient::connect(opts.rpc_url());

    // fetch raw indexer functions for use in indexer
    // Could this give us results from a newer block than the next block we receive from the Lake?
    tracing::info!(
        target: INDEXER,
        "Fetching indexer functions from contract registry..."
    );
    let indexer_functions = indexer_registry::read_indexer_functions_from_registry(
        &json_rpc_client,
        &registry_contract_id,
    )
    .await;
    let indexer_functions = indexer_registry::build_registry_from_json(indexer_functions);
    let indexer_registry: SharedIndexerRegistry =
        std::sync::Arc::new(Mutex::new(indexer_functions));

    tracing::info!(target: INDEXER, "Generating LakeConfig...");
    let config: near_lake_framework::LakeConfig = opts.to_lake_config().await;

    tracing::info!(target: INDEXER, "Instantiating the stream...",);
    let (sender, stream) = near_lake_framework::streamer(config);

    tokio::spawn(utils::stats(redis_connection_manager.clone()));
    tokio::spawn(metrics::init_server(opts.port).expect("Failed to start metrics server"));

    tracing::info!(target: INDEXER, "Starting queryapi_coordinator...",);
    let mut handlers = tokio_stream::wrappers::ReceiverStream::new(stream)
        .map(|streamer_message| {
            metrics::BLOCK_COUNT.inc();
            metrics::LATEST_BLOCK_HEIGHT
                .set(streamer_message.block.header.height.try_into().unwrap());

            let context = QueryApiContext {
                redis_connection_manager: &redis_connection_manager,
                queue_url: &queue_url,
                json_rpc_client: &json_rpc_client,
                balance_cache: &balances_cache,
                registry_contract_id: &registry_contract_id,
                streamer_message,
                chain_id,
                queue_client,
            };
            handle_streamer_message(context, indexer_registry.clone())
        })
        .buffer_unordered(1usize);

    while let Some(_handle_message) = handlers.next().await {}
    drop(handlers); // close the channel so the sender will stop

    // propagate errors from the sender
    match sender.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(e),
        Err(e) => Err(anyhow::Error::from(e)), // JoinError
    }
}

async fn handle_streamer_message(
    context: QueryApiContext<'_>,
    indexer_registry: SharedIndexerRegistry,
) -> anyhow::Result<u64> {
    // This is a single hardcoded filter, which is standing in for filters on IndexerFunctions.
    let indexer_rules: Vec<IndexerRule> = vec![indexer_rules_engine::near_social_indexer_rule()];

    // build context for enriching filter matches
    cache::update_all(&context.streamer_message, context.redis_connection_manager).await?;

    let mut reducer_futures = stream::iter(indexer_rules.iter())
        .map(|indexer_rule| indexer_rules_engine::reduce_indexer_rule_matches(
            indexer_rule,
            &context.streamer_message,
            context.redis_connection_manager,
            context.chain_id.clone(),
        ))
        // TODO: fix this it takes 10 vecs of vecs while we want to take 10 AlertQueueMessages
        .buffer_unordered(10usize);

    let block_height: BlockHeight = context.streamer_message.block.header.height;

    let mut indexer_registry_locked = indexer_registry.lock().await;
    let spawned_indexers = indexer_registry::index_registry_changes(
        block_height,
        &mut indexer_registry_locked,
        &context,
    )
    .await;
    if !spawned_indexers.is_empty() {
        tracing::info!(
            target: INDEXER,
            "Spawned {} historical backfill indexers",
            spawned_indexers.len()
        );
    }

    while let Some(indexer_rule_matches) = reducer_futures.next().await {
        if let Ok(indexer_rule_matches) = indexer_rule_matches {
            // for each alert_queue_message from the reducer
            //   for each indexer_function create a new alert_queue_message
            // Once the filters are tied to indexer functions, these will de-nest
            let mut indexer_function_messages: Vec<IndexerQueueMessage> = Vec::new();
            for indexer_rule_match in indexer_rule_matches.iter() {
                for (_account, functions) in &mut indexer_registry_locked.iter_mut() {
                    for (_function_name, indexer_function) in &mut functions.iter_mut() {
                        let msg = IndexerQueueMessage {
                            chain_id: indexer_rule_match.chain_id.clone(),
                            indexer_rule_id: indexer_rule_match.indexer_rule_id.unwrap_or(0),
                            indexer_rule_name: indexer_rule_match.indexer_rule_name.clone().unwrap_or("".to_string()),
                            payload: Some(indexer_rule_match.payload.clone()),
                            block_height,
                            indexer_function: indexer_function.clone(),
                        };
                        indexer_function_messages.push(msg);

                        if !indexer_function.provisioned {
                            indexer_function.provisioned = true;
                        }
                    }
                }
            }

            stream::iter(indexer_function_messages.into_iter())
                .chunks(10)
                .for_each(|alert_queue_messages_batch| async {
                    match opts::send_to_indexer_queue(
                        context.queue_client,
                        context.queue_url.to_string(),
                        alert_queue_messages_batch,
                    )
                    .await
                    {
                        Ok(_) => {}
                        Err(err) => tracing::error!(
                            target: INDEXER,
                            "#{} an error occurred during sending messages to the queue\n{:#?}",
                            context.streamer_message.block.header.height,
                            err
                        ),
                    }
                })
                .await;
        }
    }

    // cache last indexed block height
    storage::update_last_indexed_block(
        context.redis_connection_manager,
        context.streamer_message.block.header.height,
    )
    .await?;

    Ok(context.streamer_message.block.header.height)
}
