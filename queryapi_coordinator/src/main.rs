use std::collections::HashMap;

use cached::SizedCache;
use futures::stream::{self, StreamExt};
use near_jsonrpc_client::JsonRpcClient;
use tokio::sync::Mutex;

use alert_rules::{AlertRule, MatchingRule};
use near_lake_framework::near_indexer_primitives::{types};
use near_lake_framework::near_indexer_primitives::types::{AccountId};

use shared::{alertexer_types::primitives::AlertQueueMessage, Opts, Parser};
use shared::alertexer_types::indexer_types::{IndexerQueueMessage, IndexerRegistry, IndexerFunction};
use storage::ConnectionManager;

pub(crate) mod cache;
mod outcomes_reducer;
mod state_changes_reducer;
mod utils;
mod indexer_registry;

pub(crate) const INDEXER: &str = "queryapi_coordinator";
pub(crate) const INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
pub(crate) const MAX_DELAY_TIME: std::time::Duration = std::time::Duration::from_millis(4000);
pub(crate) const RETRY_COUNT: usize = 2;

pub(crate) type AlertRulesInMemory =
    std::sync::Arc<Mutex<HashMap<i32, AlertRule>>>;

type SharedIndexerRegistry = std::sync::Arc<Mutex<IndexerRegistry>>;

#[derive(Debug, Default, Clone, Copy)]
pub struct BalanceDetails {
    pub non_staked: types::Balance,
    pub staked: types::Balance,
}

pub type BalanceCache = std::sync::Arc<Mutex<SizedCache<AccountId, BalanceDetails>>>;

pub(crate) struct AlertexerContext<'a> {
    pub streamer_message: near_lake_framework::near_indexer_primitives::StreamerMessage,
    pub chain_id: &'a shared::alertexer_types::primitives::ChainId,
    pub queue_client: &'a shared::QueueClient,
    pub queue_url: &'a str,
    pub alert_rules_inmemory: AlertRulesInMemory,
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

    tracing::info!(target: INDEXER, "Starting the Alert Rules fetcher...");
    let pool = utils::establish_alerts_db_connection(&opts.database_url).await;

    // Prevent indexer from start indexing unless we connect and get AlertRules from the DB
    let alert_rules = loop {
        match utils::fetch_alert_rules(&pool, chain_id).await {
            Ok(alert_rules_tuples) => break alert_rules_tuples,
            Err(err) => {
                tracing::warn!(
                    target: INDEXER,
                    "Failed to fetch AlertRules from DB. Retrying in 1s...\n{:#?}",
                    err
                );
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    };

    let alert_rules_hashmap: HashMap<i32, AlertRule> =
        alert_rules.into_iter().collect();

    let alert_rules_inmemory: AlertRulesInMemory =
        std::sync::Arc::new(Mutex::new(alert_rules_hashmap));

    tokio::spawn(utils::alert_rules_fetcher(
        pool,
        std::sync::Arc::clone(&alert_rules_inmemory),
        chain_id.clone(),
    ));

    let json_rpc_client = JsonRpcClient::connect(opts.rpc_url());

    // fetch raw indexer functions for use in indexer
    // Could this give us results from a newer block than the next block we receive from the Lake?
    tracing::info!(target: INDEXER, "Fetching indexer functions from contract registry...");
    let indexer_functions = indexer_registry::read_indexer_functions_from_registry(&json_rpc_client).await;
    let mut indexer_functions = indexer_registry::build_registry_from_old_json(indexer_functions);
    let mut indexer_registry: SharedIndexerRegistry = std::sync::Arc::new(Mutex::new(indexer_functions));

    tracing::info!(target: INDEXER, "Generating LakeConfig...");
    let config: near_lake_framework::LakeConfig = opts.to_lake_config().await;

    tracing::info!(target: INDEXER, "Instantiating the stream...",);
    let (sender, stream) = near_lake_framework::streamer(config);

    tokio::spawn(utils::stats(
        redis_connection_manager.clone(),
        std::sync::Arc::clone(&alert_rules_inmemory),
    ));

    tracing::info!(target: INDEXER, "Starting queryapi_coordinator...",);
    let mut handlers = tokio_stream::wrappers::ReceiverStream::new(stream)
        .map(|streamer_message| {
            let context = AlertexerContext {
                alert_rules_inmemory: std::sync::Arc::clone(&alert_rules_inmemory),
                redis_connection_manager: &redis_connection_manager,
                queue_url: &queue_url,
                json_rpc_client: &json_rpc_client,
                balance_cache: &balances_cache,
                streamer_message,
                chain_id,
                queue_client,
            };
            handle_streamer_message(context,  indexer_registry.clone())
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

async fn handle_streamer_message(context: AlertexerContext<'_>, indexer_registry: SharedIndexerRegistry) -> anyhow::Result<u64> {
    let alert_rules_inmemory_lock = context.alert_rules_inmemory.lock().await;
    // TODO: avoid cloning
    let alert_rules: Vec<AlertRule> =
        alert_rules_inmemory_lock.values().cloned().collect();
    drop(alert_rules_inmemory_lock);

    cache::cache_txs_and_receipts(&context.streamer_message, context.redis_connection_manager)
        .await?;

    let mut reducer_futures = stream::iter(alert_rules.iter())
        .map(|alert_rule| reduce_alert_queue_messages(alert_rule, &context))
        // TODO: fix this it takes 10 vecs of vecs while we want to take 10 AlertQueueMessages
        .buffer_unordered(10usize);

    let mut indexer_registry_locked = indexer_registry.lock().await;
    indexer_registry::index_registry_changes(&mut indexer_registry_locked, &context).await;

    while let Some(alert_queue_messages) = reducer_futures.next().await {
        if let Ok(alert_queue_messages) = alert_queue_messages {

            // for each alert_queue_message from the reducer
            //   for each indexer_function create a new alert_queue_message
            // Once the filters are tied to indexer functions, these will de-nest
            let mut indexer_function_messages: Vec<IndexerQueueMessage> = Vec::new();
            for alert_queue_message in alert_queue_messages.iter() {
                for(account, functions) in &mut indexer_registry_locked.iter_mut() {
                    for (function_name, indexer_function) in &mut functions.iter_mut() {
                        let block_height = context.streamer_message.block.header.height;
                        let msg = IndexerQueueMessage {
                            chain_id: alert_queue_message.chain_id.clone(),
                            alert_rule_id: alert_queue_message.alert_rule_id,
                            alert_name: alert_queue_message.alert_name.clone(),
                            payload: alert_queue_message.payload.clone(),
                            block_height,
                            indexer_function: indexer_function.clone(),
                        };
                        indexer_function_messages.push(msg);

                        if indexer_function.provisioned == false {
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
    context: &AlertexerContext<'_>,
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
