#![feature(explicit_generic_args_with_impl_trait)]
use std::collections::HashMap;
use std::error::Error;

use cached::SizedCache;
use futures::stream::{self, StreamExt};
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::query::{QueryResponseKind, RpcQueryRequest};
use tokio::sync::Mutex;

use alert_rules::{AlertRule, AlertRuleKind, MatchingRule, Status};
use near_lake_framework::near_indexer_primitives::{types};
use near_lake_framework::near_indexer_primitives::types::{AccountId, FunctionArgs};
use near_lake_framework::near_indexer_primitives::types::BlockReference::Finality;
use near_lake_framework::near_indexer_primitives::types::Finality::Final;
use near_lake_framework::near_indexer_primitives::views::QueryRequest;
use serde_json::{json, Value};

use shared::{alertexer_types::primitives::AlertQueueMessage, Opts, Parser};
use shared::alertexer_types::primitives::{IndexerQueueMessage};
use storage::ConnectionManager;

pub(crate) mod cache;
mod outcomes_reducer;
mod state_changes_reducer;
mod utils;

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
    pub chain_id: &'a shared::alertexer_types::primitives::ChainId,
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

    let alert_rules_hashmap: HashMap<i32, alert_rules::AlertRule> =
        alert_rules.into_iter().collect();

    let alert_rules_inmemory: AlertRulesInMemory =
        std::sync::Arc::new(tokio::sync::Mutex::new(alert_rules_hashmap));

    tokio::spawn(utils::alert_rules_fetcher(
        pool,
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

    index_registry_changes(&context, context.json_rpc_client,
                           context.redis_connection_manager).await;

    let mut reducer_futures = stream::iter(alert_rules.iter())
        .map(|alert_rule| reduce_alert_queue_messages(alert_rule, &context))
        // TODO: fix this it takes 10 vecs of vecs while we want to take 10 AlertQueueMessages
        .buffer_unordered(10usize);

    let indexer_functions = fetch_indexer_functions(context.json_rpc_client,
                                                    context.redis_connection_manager).await;

    while let Some(alert_queue_messages) = reducer_futures.next().await {
        if let Ok(alert_queue_messages) = alert_queue_messages {

            // for each alert_queue_message from the reducer
            //   for each indexer_function create a new alert_queue_message
            // Once the filters are tied to indexer functions, these will de-nest
            let mut indexer_function_messages: Vec<IndexerQueueMessage> = Vec::new();
            for(alert_queue_message) in alert_queue_messages.iter() {
                for (function_name, function_code) in indexer_functions.as_object().unwrap() {
                    let block_height = context.streamer_message.block.header.height;
                    let msg = IndexerQueueMessage {
                        chain_id: alert_queue_message.chain_id.clone(),
                        alert_rule_id: alert_queue_message.alert_rule_id,
                        alert_name: alert_queue_message.alert_name.clone(),
                        payload: alert_queue_message.payload.clone(),
                        block_height,
                        function_name: function_name.clone(),
                        function_code: function_code.clone().to_string(),
                    };
                    indexer_function_messages.push(msg);
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

async fn index_registry_changes(context: &AlertexerContext<'_>, rpc_client: &JsonRpcClient,
                                redis_connection_manager: &ConnectionManager) {
    let matching_rule = MatchingRule::ActionFunctionCall {
        affected_account_id: "registry.queryapi.near".to_string(),
        function: "register_indexer_function".to_string(),
        status: Status::Any,
    };
    let registry_calls = AlertRule {
        id: 0,
        name: "indexer_function_registry_changes".to_string(),
        chain_id: alert_rules::ChainId::Mainnet,
        alert_rule_kind: AlertRuleKind::Actions,
        is_paused: false,
        updated_at: None,
        matching_rule,
    };
    match outcomes_reducer::reduce_alert_queue_messages_from_outcomes(&registry_calls, context).await {
       Ok(registry_updates) => {
           if registry_updates.len() > 0 {
               println!("indexing registry_updates: {:?}", registry_updates);
               read_indexer_functions_from_registry(rpc_client, redis_connection_manager).await;
           }
       }
        Err(error) => {
            panic!("Error indexing indexer functions: {:?}", error);
        }
    }
}

async fn fetch_indexer_functions(rpc_client: &JsonRpcClient,
                                 redis_connection_manager: &ConnectionManager) -> Value {
    match storage::get::<Option<String>>(
        redis_connection_manager,
        "indexer_function_registry",
    ).await {
        Ok(Some(indexer_functions)) => {
            let indexer_functions: Value = serde_json::from_str(&indexer_functions).unwrap();
            indexer_functions
        },
        Ok(None) => {
            read_indexer_functions_from_registry(rpc_client, redis_connection_manager).await
        }
        Err(err) => {
            panic!("Unable to read indexer functions from redis: {:?}", err);
        }
    }
}

async fn read_indexer_functions_from_registry(rpc_client: &JsonRpcClient, redis_connection_manager: &ConnectionManager) -> Value {
    match read_only_call(rpc_client,
                         "registry.queryapi.near",
                         "list_indexer_functions",
                         FunctionArgs::from(json!({}).to_string().into_bytes())).await {
        Ok(functions) => {
            // update cache with new indexer functions
            let functions_string = serde_json::to_string(&functions).unwrap();
            match storage::set(redis_connection_manager, "indexer_function_registry", &functions_string).await {
                Ok(_) => {}
                Err(err) => {
                    tracing::error!("Unable to update indexer functions cache: {:?}", err);
                }
            }
            functions
        },
        Err(err) => {
            panic!("Unable to read indexer functions from registry: {:?}", err);
        }
    }
}


async fn read_only_call(client: &JsonRpcClient, contract_name: &str, function_name: &str, args: FunctionArgs) -> Result<serde_json::Value, anyhow::Error> {

    let account_id: AccountId = contract_name.parse()?;

    let request = RpcQueryRequest {
        block_reference: Finality(Final),
        request: QueryRequest::CallFunction {
            account_id,
            method_name: function_name.to_string(),
            args,
        },
    };

    let response = client.call(request).await?;

    if let QueryResponseKind::CallResult(result) = response.kind {
        return Ok(serde_json::from_str(std::str::from_utf8(&result.result).unwrap()).unwrap());
    }

    Err(anyhow::anyhow!("Unable to read indexer functions from registry: {:?}", response))
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
