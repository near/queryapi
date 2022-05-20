use crate::types::TxAlertRule;
use futures::StreamExt;
use near_lake_framework::near_indexer_primitives::IndexerTransactionWithOutcome;

pub(crate) async fn transactions(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    transaction_alert_rules: &[TxAlertRule],
) -> anyhow::Result<()> {
    let mut futures: futures::stream::FuturesUnordered<_> = transaction_alert_rules
        .iter()
        .map(|tx_alert_rule| tx_matcher(streamer_message, tx_alert_rule))
        .collect();

    while let Some(_) = futures.next().await {}
    Ok(())
}

async fn tx_matcher(
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    alert_rule: &TxAlertRule,
) {
    let mut futures: futures::stream::FuturesUnordered<_> = streamer_message
        .shards
        .iter()
        .filter_map(|shard| shard.chunk.as_ref())
        .map(|chunk| chunk.transactions.iter())
        .flatten()
        .filter_map(|tx| {
            if tx.transaction.signer_id.to_string() == alert_rule.account_id
                || tx.transaction.receiver_id.to_string() == alert_rule.account_id
            {
                Some(tx_handler(tx, alert_rule, streamer_message))
            } else {
                None
            }
        })
        .collect();
    while let Some(_) = futures.next().await {}
}

async fn tx_handler(
    transaction: &IndexerTransactionWithOutcome,
    alert_rule: &TxAlertRule,
    streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
) -> bool {
    loop {
        match crate::sender::send_to_the_queue(format!(
            "TX {} affects {}",
            transaction.transaction.hash, alert_rule.account_id
        ))
        .await
        {
            Ok(_) => break true,
            Err(err) => {
                tracing::error!(
                    target: crate::INDEXER,
                    "Error sending the alert to the queue. Retrying in 1s...{:#?}",
                    err
                );
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}
