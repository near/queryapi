use cached::SizedCache;
use futures::stream::{self, StreamExt};
use near_jsonrpc_client::JsonRpcClient;
use tokio::sync::Mutex;

use indexer_rules_engine::types::indexer_rule_match::{ChainId, IndexerRuleMatch};
use near_lake_framework::near_indexer_primitives::types::{AccountId, BlockHeight};
use near_lake_framework::near_indexer_primitives::{types, StreamerMessage};

use crate::indexer_types::IndexerFunction;
use indexer_types::{IndexerQueueMessage, IndexerRegistry};
use opts::{Opts, Parser};
use storage::ConnectionManager;

pub(crate) mod cache;
mod indexer_reducer;
mod indexer_registry;
mod indexer_types;
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
    // build context for enriching filter matches
    cache::update_all(&context.streamer_message, context.redis_connection_manager).await?;

    let mut indexer_registry_locked = indexer_registry.lock().await;
    let indexer_functions =
        indexer_registry::registry_as_vec_of_indexer_functions(&indexer_registry_locked);

    let mut indexer_function_filter_matches_futures = stream::iter(indexer_functions.iter())
        .map(|indexer_function| {
            reduce_rule_matches_for_indexer_function(
                indexer_function,
                &context.streamer_message,
                context.chain_id.clone(),
            )
        })
        // TODO: fix the buffer size used to accumulate results, it takes 10 vecs of vecs while we want to take 10 IndexerRuleMatches
        .buffer_unordered(10usize);

    let block_height: BlockHeight = context.streamer_message.block.header.height;

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

    while let Some(indexer_function_with_matches) =
        indexer_function_filter_matches_futures.next().await
    {
        if let Ok(indexer_function_with_matches) = indexer_function_with_matches {
            let indexer_function = indexer_function_with_matches.indexer_function;
            let indexer_rule_matches = indexer_function_with_matches.matches;

            let mut indexer_function_messages: Vec<IndexerQueueMessage> = Vec::new();

            for indexer_rule_match in indexer_rule_matches.iter() {
                let msg = IndexerQueueMessage {
                    chain_id: indexer_rule_match.chain_id.clone(),
                    indexer_rule_id: indexer_rule_match.indexer_rule_id.unwrap_or(0),
                    indexer_rule_name: indexer_rule_match
                        .indexer_rule_name
                        .clone()
                        .unwrap_or("".to_string()),
                    payload: Some(indexer_rule_match.payload.clone()),
                    block_height,
                    indexer_function: indexer_function.clone(),
                };
                indexer_function_messages.push(msg);

                if !indexer_function.provisioned {
                    indexer_registry_locked
                        .get_mut(&indexer_function.account_id)
                        .unwrap()
                        .get_mut(&indexer_function.function_name)
                        .unwrap()
                        .provisioned = true;
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

    metrics::BLOCK_COUNT.inc();
    metrics::LATEST_BLOCK_HEIGHT.set(
        context
            .streamer_message
            .block
            .header
            .height
            .try_into()
            .unwrap(),
    );

    Ok(context.streamer_message.block.header.height)
}

struct IndexerFunctionWithMatches<'b> {
    pub indexer_function: &'b IndexerFunction,
    pub matches: Vec<IndexerRuleMatch>,
}

async fn reduce_rule_matches_for_indexer_function<'x>(
    indexer_function: &'x IndexerFunction,
    streamer_message: &StreamerMessage,
    chain_id: ChainId,
) -> anyhow::Result<IndexerFunctionWithMatches<'x>> {
    let matches = indexer_rules_engine::reduce_indexer_rule_matches(
        &indexer_function.indexer_rule,
        &streamer_message,
        chain_id.clone(),
    )
    .await?;
    Ok(IndexerFunctionWithMatches {
        indexer_function,
        matches,
    })
}
