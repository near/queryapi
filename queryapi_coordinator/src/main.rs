use cached::SizedCache;
use futures::stream::{self, StreamExt};
use near_jsonrpc_client::JsonRpcClient;
use tokio::sync::Mutex;

use alert_rules::{AlertRule, AlertRuleKind, MatchingRule, Status};
use near_lake_framework::near_indexer_primitives::types;
use near_lake_framework::near_indexer_primitives::types::{AccountId, BlockHeight};

use shared::alertexer_types::indexer_types::{IndexerQueueMessage, IndexerRegistry};
use shared::{alertexer_types::primitives::AlertQueueMessage, Opts, Parser};
use storage::ConnectionManager;

pub(crate) mod cache;
mod indexer_registry;
mod outcomes_reducer;
mod state_changes_reducer;
mod utils;

pub(crate) const INDEXER: &str = "queryapi_coordinator";
pub(crate) const INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
pub(crate) const MAX_DELAY_TIME: std::time::Duration = std::time::Duration::from_millis(4000);
pub(crate) const RETRY_COUNT: usize = 2;
pub(crate) const REGISTRY_CONTRACT: &str = "registry.queryapi.near";

type SharedIndexerRegistry = std::sync::Arc<Mutex<IndexerRegistry>>;

#[derive(Debug, Default, Clone, Copy)]
pub struct BalanceDetails {
    pub non_staked: types::Balance,
    pub staked: types::Balance,
}

pub type BalanceCache = std::sync::Arc<Mutex<SizedCache<AccountId, BalanceDetails>>>;

pub(crate) struct QueryApiContext<'a> {
    pub streamer_message: near_lake_framework::near_indexer_primitives::StreamerMessage,
    pub chain_id: &'a shared::alertexer_types::primitives::ChainId,
    pub queue_client: &'a shared::QueueClient,
    pub queue_url: &'a str,
    pub balance_cache: &'a BalanceCache,
    pub redis_connection_manager: &'a ConnectionManager,
    pub json_rpc_client: &'a JsonRpcClient,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::init_tracing();

    shared::dotenv::dotenv().ok();

    let opts = Opts::parse();

    let chain_id = &opts.chain_id();
    let aws_region = opts.aws_queue_region.clone();
    let queue_client = &opts.queue_client(aws_region);
    let queue_url = opts.queue_url.clone();

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
    let indexer_functions =
        indexer_registry::read_indexer_functions_from_registry(&json_rpc_client).await;
    let indexer_functions = indexer_registry::build_registry_from_json(indexer_functions);
    let indexer_registry: SharedIndexerRegistry =
        std::sync::Arc::new(Mutex::new(indexer_functions));

    tracing::info!(target: INDEXER, "Generating LakeConfig...");
    let config: near_lake_framework::LakeConfig = opts.to_lake_config().await;

    tracing::info!(target: INDEXER, "Instantiating the stream...",);
    let (sender, stream) = near_lake_framework::streamer(config);

    tokio::spawn(utils::stats(redis_connection_manager.clone()));

    tracing::info!(target: INDEXER, "Starting queryapi_coordinator...",);
    let mut handlers = tokio_stream::wrappers::ReceiverStream::new(stream)
        .map(|streamer_message| {
            let context = QueryApiContext {
                redis_connection_manager: &redis_connection_manager,
                queue_url: &queue_url,
                json_rpc_client: &json_rpc_client,
                balance_cache: &balances_cache,
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
    let alert_rules: Vec<AlertRule> = vec![near_social_alert_rule()];

    cache::cache_txs_and_receipts(&context.streamer_message, context.redis_connection_manager)
        .await?;

    let mut reducer_futures = stream::iter(alert_rules.iter())
        .map(|alert_rule| reduce_alert_queue_messages(alert_rule, &context))
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

    while let Some(alert_queue_messages) = reducer_futures.next().await {
        if let Ok(alert_queue_messages) = alert_queue_messages {
            // for each alert_queue_message from the reducer
            //   for each indexer_function create a new alert_queue_message
            // Once the filters are tied to indexer functions, these will de-nest
            let mut indexer_function_messages: Vec<IndexerQueueMessage> = Vec::new();
            for alert_queue_message in alert_queue_messages.iter() {
                for (_account, functions) in &mut indexer_registry_locked.iter_mut() {
                    for (_function_name, indexer_function) in &mut functions.iter_mut() {
                        let msg = IndexerQueueMessage {
                            chain_id: alert_queue_message.chain_id.clone(),
                            alert_rule_id: alert_queue_message.alert_rule_id,
                            alert_name: alert_queue_message.alert_name.clone(),
                            payload: Some(alert_queue_message.payload.clone()),
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
                    match shared::send_to_indexer_queue(
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

async fn reduce_alert_queue_messages(
    alert_rule: &AlertRule,
    context: &QueryApiContext<'_>,
) -> anyhow::Result<Vec<AlertQueueMessage>> {
    Ok(match &alert_rule.matching_rule {
        MatchingRule::ActionAny { .. }
        | MatchingRule::ActionFunctionCall { .. }
        | MatchingRule::ActionTransfer { .. }
        | MatchingRule::Event { .. } => {
            outcomes_reducer::reduce_alert_queue_messages_from_outcomes(alert_rule, context).await?
        }
        MatchingRule::StateChangeAccountBalance { .. } => {
            state_changes_reducer::reduce_alert_queue_messages_from_state_changes(
                alert_rule, context,
            )
            .await?
        }
    })
}

fn near_social_alert_rule() -> AlertRule {
    let contract = "social.near";
    let method = "set";
    let matching_rule = MatchingRule::ActionFunctionCall {
        affected_account_id: contract.to_string(),
        function: method.to_string(),
        status: Status::Any,
    };
    AlertRule {
        id: 0,
        name: format!("{} {}{}", contract, method, "_changes"),
        chain_id: alert_rules::ChainId::Mainnet,
        alert_rule_kind: AlertRuleKind::Actions,
        is_paused: false,
        updated_at: None,
        matching_rule,
    }
}
