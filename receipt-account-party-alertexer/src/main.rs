#![feature(explicit_generic_args_with_impl_trait)]
use futures::StreamExt;

use shared::{Opts, Parser};

mod checker;
pub(crate) const INDEXER: &str = "alertexer";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // MOCK
    let receipt_account_alert_rules = vec![alert_rules::ReceiptAccountPartyAlertRule {
        account_id: "aurora".to_owned(),
    }];
    // END MOCK
    shared::init_tracing();

    let opts = Opts::parse();
    tracing::info!(target: INDEXER, "Connecting to redis...");
    let redis_connection_manager = storage::connect(&opts.redis_connection_string).await?;

    tracing::info!(target: INDEXER, "Generating LakeConfig...");
    let config: near_lake_framework::LakeConfig = opts.into();

    tracing::info!(target: INDEXER, "Instantiating the stream...",);
    let (sender, stream) = near_lake_framework::streamer(config);

    tokio::spawn(stats(redis_connection_manager.clone()));
    tracing::info!(target: INDEXER, "Starting Alertexer...",);
    let mut handlers = tokio_stream::wrappers::ReceiverStream::new(stream)
        .map(|streamer_message| {
            handle_streamer_message(
                streamer_message,
                &receipt_account_alert_rules,
                &redis_connection_manager,
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
    receipt_account_alert_rules: &[alert_rules::ReceiptAccountPartyAlertRule],
    redis_connection_manager: &storage::ConnectionManager,
) -> anyhow::Result<u64> {
    let receipt_checker_future = checker::receipts(
        &streamer_message,
        receipt_account_alert_rules,
        redis_connection_manager,
    );

    match futures::try_join!(receipt_checker_future) {
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

async fn stats(redis_connection_manager: storage::ConnectionManager) {
    let interval_secs = 10;
    let mut previous_processed_blocks: u64 =
        storage::get::<u64>(&redis_connection_manager, "blocks_processed")
            .await
            .unwrap_or(0);

    loop {
        let processed_blocks: u64 = match storage::get::<u64>(
            &redis_connection_manager,
            "blocks_processed",
        )
        .await
        {
            Ok(value) => value,
            Err(err) => {
                tracing::error!(target: "stats", "Failed to get `blocks_processed` from Redis. Retry in 10s...\n{:#?}", err);
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                continue;
            }
        };

        let bps = (processed_blocks - previous_processed_blocks) / interval_secs * 60;

        tracing::info!(target: "stats", "stats: {} bps", bps);
        previous_processed_blocks = processed_blocks;
        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
    }
}
