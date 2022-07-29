pub(crate) async fn alert_rules_fetcher(
    database_connection_string: String,
    alert_rules_inmemory: crate::AlertRulesInMemory,
    chain_id: shared::types::primitives::ChainId,
) {
    let pool = loop {
        match alert_rules::connect(&database_connection_string).await {
            Ok(res) => break res,
            Err(err) => {
                tracing::warn!(
                    target: crate::INDEXER,
                    "Failed to establish connection with DB. Retrying in 1s...\n{:#?}",
                    err
                );
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
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
                        target: crate::INDEXER,
                        "Failed to fetch AlertRulesInMemory from DB. Retrying in 1s...\n{:#?}",
                        err
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            }
        };

        let mut alert_rules_inmemory_lock = alert_rules_inmemory.lock().await;
        alert_rules_inmemory_lock.clear();
        alert_rules_inmemory_lock.extend(alert_rules_tuples.into_iter().filter_map(
            |(id, alert_rule)| {
                if !alert_rule.is_paused {
                    Some((id, alert_rule))
                } else {
                    None
                }
            },
        ));

        drop(alert_rules_inmemory_lock);

        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }
}

pub(crate) async fn stats(
    redis_connection_manager: storage::ConnectionManager,
    alert_rules_inmemory: crate::AlertRulesInMemory,
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
