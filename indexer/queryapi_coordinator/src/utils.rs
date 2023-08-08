use crate::metrics;

pub(crate) async fn stats(redis_connection_manager: storage::ConnectionManager) {
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

        let alert_rules_count = 1; // Hardcoding until IndexerFunctions have filters

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
            "#{} | {} bps | {} blocks processed | {} Hardcoded AlertRules",
            last_indexed_block,
            bps,
            processed_blocks,
            alert_rules_count,
        );
        previous_processed_blocks = processed_blocks;

        let streams = storage::smembers(&redis_connection_manager, storage::INDEXER_SET_KEY)
            .await
            .unwrap_or(Vec::new());

        for stream in streams {
            let latest_id = storage::get::<String>(
                &redis_connection_manager,
                storage::generate_stream_last_id_key(&stream),
            )
            .await
            .unwrap_or(storage::STREAM_SMALLEST_ID.to_string());

            let unprocessed_message_count = storage::xrange(
                &redis_connection_manager,
                storage::generate_stream_key(&stream),
                &latest_id,
                storage::STREAM_LARGEST_ID,
            )
            .await
            .unwrap_or(Vec::new())
            .len() as i64;

            metrics::UNPROCESSED_STREAM_MESSAGES
                .with_label_values(&[&stream])
                .set(unprocessed_message_count);
        }

        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
    }
}
