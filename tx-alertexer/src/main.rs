use futures::StreamExt;

use shared::{Opts, Parser};

mod checker;
pub mod storage;
pub(crate) mod types;

pub(crate) const INDEXER: &str = "alertexer";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // MOCK
    let tx_alert_rules = vec![types::TxAlertRule {
        account_id: "aurora".to_owned(),
    }];
    // END MOCK
    shared::init_tracing();

    tracing::info!(target: INDEXER, "Connecting to redis...");
    let redis_connection_manager = storage::connect().await?;

    tracing::info!(target: INDEXER, "Generating LakeConfig...");
    let config: near_lake_framework::LakeConfig = Opts::parse().into();

    tracing::info!(target: INDEXER, "Instantiating the stream...",);
    let (sender, stream) = near_lake_framework::streamer(config);

    tracing::info!(target: INDEXER, "Starting Alertexter...",);
    let mut handlers = tokio_stream::wrappers::ReceiverStream::new(stream)
        .map(|streamer_message| {
            handle_streamer_message(streamer_message, &tx_alert_rules, &redis_connection_manager)
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
    tx_alert_rule: &[types::TxAlertRule],
    redis_connection_manager: &redis::aio::ConnectionManager,
) -> anyhow::Result<u64> {
    tracing::info!(
        target: INDEXER,
        "Block {}",
        streamer_message.block.header.height
    );

    let tx_checker_future =
        checker::transactions(&streamer_message, &tx_alert_rule, &redis_connection_manager);

    match futures::try_join!(tx_checker_future) {
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

    storage::set_str(
        redis_connection_manager,
        "last_indexed_block",
        &streamer_message.block.header.height.to_string(),
    )
    .await?;

    Ok(streamer_message.block.header.height)
}
