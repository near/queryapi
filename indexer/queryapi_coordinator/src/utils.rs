use serde_json::Value;

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
        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
    }
}

pub(crate) fn serialize_to_camel_case_json_string(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
) -> anyhow::Result<String, serde_json::Error> {
    // Serialize the Message object to a JSON string
    let json_str = serde_json::to_string(&streamer_message)?;

    // Deserialize the JSON string to a Value Object
    let mut message_value: Value = serde_json::from_str(&json_str)?;

    // Convert keys to Camel Case
    to_camel_case_keys(&mut message_value);

    return serde_json::to_string(&message_value);
}

fn to_camel_case_keys(message_value: &mut Value) {
    // Only process if subfield contains objects
    match message_value {
        Value::Object(map) => {
            for key in map.keys().cloned().collect::<Vec<String>>() {
                // Generate Camel Case Key
                let new_key = key
                    .split("_")
                    .enumerate()
                    .map(|(i, str)| {
                        if i > 0 {
                            return str[..1].to_uppercase() + &str[1..];
                        }
                        return str.to_owned();
                    })
                    .collect::<Vec<String>>()
                    .join("");

                // Recursively process inner fields and update map with new key
                if let Some(mut val) = map.remove(&key) {
                    to_camel_case_keys(&mut val);
                    map.insert(new_key, val);
                }
            }
        }
        Value::Array(vec) => {
            for val in vec {
                to_camel_case_keys(val);
            }
        }
        _ => {}
    }
}
