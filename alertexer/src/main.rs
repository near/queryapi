#![feature(explicit_generic_args_with_impl_trait)]
use futures::StreamExt;
use std::collections::HashMap;

use near_lake_framework::near_indexer_primitives::IndexerExecutionOutcomeWithReceipt;

use shared::{Opts, Parser};

pub(crate) mod cache;
mod checkers;
pub(crate) mod matchers;
pub(crate) const INDEXER: &str = "alertexer";

pub(crate) type AlertRulesInMemory =
    std::sync::Arc<tokio::sync::Mutex<HashMap<i32, alert_rules::AlertRule>>>;

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

    tracing::info!(target: INDEXER, "Connecting to redis...");
    let redis_connection_manager = storage::connect(&opts.redis_connection_string).await?;

    tracing::info!(target: INDEXER, "Starting the Alert Rules fetcher...");
    tokio::spawn(alert_rules_fetcher(
        opts.database_url.clone(),
        std::sync::Arc::clone(&alert_rules_inmemory),
        chain_id.clone(),
    ));

    tracing::info!(target: INDEXER, "Generating LakeConfig...");
    let config: near_lake_framework::LakeConfig = opts.to_lake_config().await;

    tracing::info!(target: INDEXER, "Instantiating the stream...",);
    let (sender, stream) = near_lake_framework::streamer(config);

    tokio::spawn(stats(
        redis_connection_manager.clone(),
        std::sync::Arc::clone(&alert_rules_inmemory),
    ));
    tracing::info!(target: INDEXER, "Starting Alertexer...",);
    let mut handlers = tokio_stream::wrappers::ReceiverStream::new(stream)
        .map(|streamer_message| {
            handle_streamer_message(
                streamer_message,
                chain_id,
                std::sync::Arc::clone(&alert_rules_inmemory),
                &redis_connection_manager,
                queue_client,
                &queue_url,
            )
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
    streamer_message: near_lake_framework::near_indexer_primitives::StreamerMessage,
    chain_id: &shared::types::primitives::ChainId,
    alert_rules_inmemory: AlertRulesInMemory,
    redis_connection_manager: &storage::ConnectionManager,
    queue_client: &shared::QueueClient,
    queue_url: &str,
) -> anyhow::Result<u64> {
    let alert_rules_inmemory_lock = alert_rules_inmemory.lock().await;
    // TODO: avoid cloning
    let alert_rules: Vec<alert_rules::AlertRule> =
        alert_rules_inmemory_lock.values().cloned().collect();
    drop(alert_rules_inmemory_lock);

    cache::cache_txs_and_receipts(&streamer_message, redis_connection_manager).await?;

    let block_hash_string = streamer_message.block.header.hash.to_string();

    let receipt_execution_outcomes: Vec<IndexerExecutionOutcomeWithReceipt> = streamer_message
        .shards
        .iter()
        .flat_map(|shard| shard.receipt_execution_outcomes.clone())
        .collect();

    // Actions and Events checks
    let outcomes_checker_future = checkers::outcomes::check_outcomes(
        &receipt_execution_outcomes,
        &block_hash_string,
        chain_id,
        &alert_rules,
        redis_connection_manager,
        queue_client,
        queue_url,
    );

    match futures::try_join!(outcomes_checker_future) {
        Ok(_) => tracing::debug!(
            target: INDEXER,
            "#{} checkers executed successful",
            streamer_message.block.header.height,
        ),
        Err(e) => tracing::error!(
            target: INDEXER,
            "#{} an error occurred during executing checkers\n{:#?}",
            streamer_message.block.header.height,
            e
        ),
    };

    storage::update_last_indexed_block(
        redis_connection_manager,
        streamer_message.block.header.height,
    )
    .await?;

    Ok(streamer_message.block.header.height)
}

async fn alert_rules_fetcher(
    database_connection_string: String,
    alert_rules_inmemory: AlertRulesInMemory,
    chain_id: shared::types::primitives::ChainId,
) {
    let pool = loop {
        match alert_rules::connect(&database_connection_string).await {
            Ok(res) => break res,
            Err(err) => {
                tracing::warn!(
                    target: INDEXER,
                    "Failed to establish connection with DB. Retrying in 10s...\n{:#?}",
                    err
                );
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            }
        }
    };

    loop {
        let alert_rules_tuples: Vec<(i32, alert_rules::AlertRule)> = loop {
            match alert_rules::AlertRule::fetch_alert_rules(
                &pool,
                alert_rules::AlertRuleKind::Actions,
                &match chain_id {
                    shared::types::primitives::ChainId::Testnet => alert_rules::ChainId::Testnet,
                    shared::types::primitives::ChainId::Mainnet => alert_rules::ChainId::Mainnet,
                },
            )
            .await
            {
                Ok(rules_from_db) => {
                    break rules_from_db
                        .into_iter()
                        .map(|alert_rule| (alert_rule.id, alert_rule))
                        .collect()
                }
                Err(err) => {
                    tracing::warn!(
                        target: INDEXER,
                        "Failed to fetch AlertRulesInMemory from DB. Retrying in 10s...\n{:#?}",
                        err
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                }
            }
        };

        let mut alert_rules_inmemory_lock = alert_rules_inmemory.lock().await;
        for (id, alert_rule) in alert_rules_tuples {
            if alert_rule.is_paused {
                alert_rules_inmemory_lock.remove(&id);
            } else {
                alert_rules_inmemory_lock.insert(id, alert_rule);
            }
        }
        drop(alert_rules_inmemory_lock);

        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }
}

async fn stats(
    redis_connection_manager: storage::ConnectionManager,
    alert_rules_inmemory: AlertRulesInMemory,
) {
    let interval_secs = 10;
    let mut previous_processed_blocks: u64 =
        storage::get::<u64>(&redis_connection_manager, "blocks_processed")
            .await
            .unwrap_or(0);

    loop {
        let processed_blocks: u64 =
            match storage::get::<u64>(&redis_connection_manager, "blocks_processed").await {
                Ok(value) => value,
                Err(err) => {
                    tracing::error!(
                        target: "stats",
                        "Failed to get `blocks_processed` from Redis. Retry in 10s...\n{:#?}",
                        err,
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                    continue;
                }
            };
        let alert_rules_inmemory_lock = alert_rules_inmemory.lock().await;
        let alert_rules_count = alert_rules_inmemory_lock.len();
        drop(alert_rules_inmemory_lock);

        let last_indexed_block =
            match storage::get_last_indexed_block(&redis_connection_manager).await {
                Ok(block_height) => block_height,
                Err(err) => {
                    tracing::warn!(
                        target: "stats",
                        "Failed to get last indexed block\n{:#?}",
                        err,
                    );
                    0
                }
            };

        let bps = (processed_blocks - previous_processed_blocks) as f64 / interval_secs as f64;

        tracing::info!(
            target: "stats",
            "#{} | {} bps | {} blocks processed | {} AlertRules",
            last_indexed_block,
            bps,
            processed_blocks,
            alert_rules_count,
        );
        previous_processed_blocks = processed_blocks;
        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
    }
}
