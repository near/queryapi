pub(crate) async fn send_to_the_queue(message: String) -> anyhow::Result<()> {
    tracing::info!(
        target: crate::INDEXER,
        "Sending alert to the queue\n{}",
        message
    );
    Ok(())
}
