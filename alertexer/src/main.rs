#![feature(explicit_generic_args_with_impl_trait)]
use std::collections::HashMap;

use cached::SizedCache;
use futures::stream::{self, StreamExt};
use tokio::sync::Mutex;

use alert_rules::MatchingRule;
use near_lake_framework::near_indexer_primitives::types;

use shared::{types::primitives::AlertQueueMessage, Opts, Parser};

pub(crate) mod cache;
mod outcomes_reducer;
mod state_changes_reducer;
mod utils;
// mod checkers;
// pub(crate) mod matchers;
pub(crate) const INDEXER: &str = "alertexer";
pub(crate) const INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
pub(crate) const MAX_DELAY_TIME: std::time::Duration = std::time::Duration::from_millis(4000);
pub(crate) const RETRY_COUNT: usize = 2;

pub(crate) type AlertRulesInMemory =
    std::sync::Arc<tokio::sync::Mutex<HashMap<i32, alert_rules::AlertRule>>>;

#[derive(Debug, Default, Clone, Copy)]
pub struct BalanceDetails {
    pub non_staked: types::Balance,
    pub staked: types::Balance,
}

pub type BalanceCache = std::sync::Arc<Mutex<SizedCache<types::AccountId, BalanceDetails>>>;

pub(crate) struct AlertexerContext<'a> {
    pub streamer_message: near_lake_framework::near_indexer_primitives::StreamerMessage,
    pub chain_id: &'a shared::types::primitives::ChainId,
    pub queue_client: &'a shared::QueueClient,
    pub queue_url: &'a str,
    pub alert_rules_inmemory: AlertRulesInMemory,
    pub balance_cache: &'a BalanceCache,
    pub redis_connection_manager: &'a storage::ConnectionManager,
    pub json_rpc_client: &'a near_jsonrpc_client::JsonRpcClient,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::init_tracing();

    shared::dotenv::dotenv().ok();

    let opts = Opts::parse();

    let chain_id = &opts.chain_id();
    let queue_client = &opts.queue_client();
    let queue_url = opts.queue_url.clone();
    let alert_rules_inmemory: AlertRulesInMemory =
        std::sync::Arc::new(tokio::sync::Mutex::new(HashMap::new()));

    // We want to prevent unnecessary RPC queries to find previous balance
    let balances_cache: BalanceCache =
        std::sync::Arc::new(Mutex::new(SizedCache::with_size(100_000)));

    tracing::info!(target: INDEXER, "Connecting to redis...");
    let redis_connection_manager = storage::connect(&opts.redis_connection_string).await?;

    tracing::info!(target: INDEXER, "Starting the Alert Rules fetcher...");
    tokio::spawn(utils::alert_rules_fetcher(
        opts.database_url.clone(),
        std::sync::Arc::clone(&alert_rules_inmemory),
        chain_id.clone(),
    ));

    let json_rpc_client = near_jsonrpc_client::JsonRpcClient::connect(opts.rpc_url());

    tracing::info!(target: INDEXER, "Generating LakeConfig...");
    let config: near_lake_framework::LakeConfig = opts.to_lake_config().await;

    tracing::info!(target: INDEXER, "Instantiating the stream...",);
    let (sender, stream) = near_lake_framework::streamer(config);

    tokio::spawn(utils::stats(
        redis_connection_manager.clone(),
        std::sync::Arc::clone(&alert_rules_inmemory),
    ));
    tracing::info!(target: INDEXER, "Starting Alertexer...",);
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
            handle_streamer_message(context)
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

async fn handle_streamer_message(context: AlertexerContext<'_>) -> anyhow::Result<u64> {
    let alert_rules_inmemory_lock = context.alert_rules_inmemory.lock().await;
    // TODO: avoid cloning
    let alert_rules: Vec<alert_rules::AlertRule> =
        alert_rules_inmemory_lock.values().cloned().collect();
    drop(alert_rules_inmemory_lock);

    cache::cache_txs_and_receipts(&context.streamer_message, context.redis_connection_manager)
        .await?;

    let mut reducer_futures = stream::iter(alert_rules.iter())
        .map(|alert_rule| reduce_alert_queue_messages(alert_rule, &context))
        // TODO: fix this it takes 10 vecs of vecs while we want to take 10 AlertQueueMessages
        .buffer_unordered(10usize);

    while let Some(alert_queue_messages) = reducer_futures.next().await {
        if let Ok(alert_queue_messages) = alert_queue_messages {
            stream::iter(alert_queue_messages.into_iter())
                .chunks(10)
                .for_each(|alert_queue_messages_batch| async {
                    match shared::send_to_the_queue(
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
    alert_rule: &alert_rules::AlertRule,
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
