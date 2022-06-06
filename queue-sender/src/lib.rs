pub async fn send_to_the_queue(message: String) -> anyhow::Result<()> {
    tracing::info!(
        target: "alertexer",
        "Sending alert to the queue\n{}",
        message
    );
    Ok(())
}
