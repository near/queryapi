use clap::Parser;
use futures::StreamExt;

use configs::Opts;

mod configs;
mod matchers;
pub(crate) mod sender;
pub(crate) mod types;
mod utils;

pub(crate) const INDEXER: &str = "alertexer";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // MOCK
    let tx_alert_rule = vec![types::TxAlertRule {
        account_id: "aurora".to_owned(),
    }];
    // END MOCK
    utils::init_tracing();

    let config: near_lake_framework::LakeConfig = Opts::parse().into();

    let (_, stream) = near_lake_framework::streamer(config);

    let mut handlers = tokio_stream::wrappers::ReceiverStream::new(stream)
        .map(|streamer_message| handle_streamer_message(streamer_message, &tx_alert_rule))
        .buffer_unordered(1usize);

    while let Some(_handle_message) = handlers.next().await {}

    Ok(())
}

async fn handle_streamer_message(
    streamer_message: near_lake_framework::near_indexer_primitives::StreamerMessage,
    tx_alert_rule: &[types::TxAlertRule],
) -> anyhow::Result<u64> {
    tracing::info!(
        target: INDEXER,
        "Block {}",
        streamer_message.block.header.height
    );

    let tx_matcher_future = matchers::transactions(&streamer_message, &tx_alert_rule);

    match futures::try_join!(tx_matcher_future) {
        Ok(_) => tracing::debug!(
            target: INDEXER,
            "#{} matchers executed successful",
            streamer_message.block.header.height,
        ),
        Err(e) => tracing::error!(
            target: INDEXER,
            "#{} an error occurred during executing matchers\n{:#?}",
            streamer_message.block.header.height,
            e
        ),
    };

    utils::store_last_indexed_block_height(streamer_message.block.header.height)
}
