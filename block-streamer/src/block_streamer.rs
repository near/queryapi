use crate::indexer_config::IndexerConfig;
use crate::rules::types::indexer_rule_match::ChainId;
use crate::rules::MatchingRule;
use anyhow::{bail, Context};
use chrono::TimeZone;
use near_lake_framework::near_indexer_primitives;
use tokio::task::JoinHandle;

pub const MAX_S3_RETRY_COUNT: u8 = 20;

pub struct Task {
    handle: JoinHandle<anyhow::Result<()>>,
    cancellation_token: tokio_util::sync::CancellationToken,
}

pub struct BlockStreamer {
    task: Option<Task>,
}

impl BlockStreamer {
    pub fn new() -> Self {
        Self { task: None }
    }

    pub fn start(
        &mut self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        indexer: IndexerConfig,
        redis_connection_manager: crate::redis::ConnectionManager,
        s3_client: crate::s3_client::S3Client,
        chain_id: ChainId,
    ) -> anyhow::Result<()> {
        if self.task.is_some() {
            return Err(anyhow::anyhow!("BlockStreamer has already been started",));
        }

        let cancellation_token = tokio_util::sync::CancellationToken::new();
        let cancellation_token_clone = cancellation_token.clone();

        let handle = tokio::spawn(async move {
            tokio::select! {
                _ = cancellation_token_clone.cancelled() => {
                    tracing::info!(
                        "Cancelling existing block stream task for indexer: {}",
                        indexer.get_full_name(),
                    );

                    Ok(())
                },
                result = start_block_stream(
                    start_block_height,
                    indexer.clone(),
                    &redis_connection_manager,
                    s3_client,
                    &chain_id,
                ) => {
                    result.map_err(|err| {
                        tracing::error!(
                            "Block stream task for indexer: {} stopped due to error: {:?}",
                            indexer.get_full_name(),
                            err,
                        );
                        err
                    })
                }
            }
        });

        self.task = Some(Task {
            handle,
            cancellation_token,
        });

        Ok(())
    }

    pub async fn cancel(&mut self) -> anyhow::Result<()> {
        if let Some(task) = self.task.take() {
            task.cancellation_token.cancel();
            let _ = task.handle.await?;

            return Ok(());
        }

        Err(anyhow::anyhow!(
            "Attempted to cancel already cancelled, or not started, BlockStreamer"
        ))
    }

    pub fn take_handle(&mut self) -> Option<JoinHandle<anyhow::Result<()>>> {
        self.task.take().map(|task| task.handle)
    }
}

pub(crate) async fn start_block_stream(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    indexer: IndexerConfig,
    redis_connection_manager: &crate::redis::ConnectionManager,
    s3_client: crate::s3_client::S3Client,
    chain_id: &ChainId,
) -> anyhow::Result<()> {
    tracing::info!(
        "Starting block stream at {start_block_height} for indexer: {}",
        indexer.get_full_name(),
    );

    let delta_lake_client = crate::delta_lake_client::DeltaLakeClient::new(s3_client.clone());

    // TODO move to DeltaLakeClient
    let start_date = get_nearest_block_date(&s3_client, start_block_height, chain_id).await?;

    let latest_block_metadata = delta_lake_client.get_latest_block_metadata().await?;
    let last_indexed_block = latest_block_metadata.last_indexed_block.parse::<u64>()?;

    let blocks_from_index = match &indexer.indexer_rule.matching_rule {
        MatchingRule::ActionAny {
            affected_account_id,
            ..
        } => {
            tracing::debug!(
                "Fetching block heights starting from {} from delta lake for indexer: {}",
                start_date.date_naive(),
                indexer.get_full_name()
            );
            // TODO Remove all block heights after start_block_height
            delta_lake_client
                .list_matching_block_heights(start_date, affected_account_id)
                .await
        }
        MatchingRule::ActionFunctionCall { .. } => {
            bail!("ActionFunctionCall matching rule not yet supported for historical processing, function: {:?} {:?}", indexer.account_id, indexer.function_name);
        }
        MatchingRule::Event { .. } => {
            bail!("Event matching rule not yet supported for historical processing, function {:?} {:?}", indexer.account_id, indexer.function_name);
        }
    }?;

    tracing::debug!(
        "Flushing {} block heights from index files to historical Stream for indexer: {}",
        blocks_from_index.len(),
        indexer.get_full_name(),
    );

    for block in &blocks_from_index {
        crate::redis::xadd(
            redis_connection_manager,
            // TODO make configurable
            crate::redis::generate_historical_stream_key(&indexer.get_full_name()),
            &[("block_height", block)],
        )
        .await
        .context("Failed to add block to Redis Stream")?;
    }

    let mut last_indexed_block =
        blocks_from_index
            .last()
            .map_or(last_indexed_block, |&last_block_in_index| {
                // Check for the case where index files are written right after we fetch the last_indexed_block metadata
                std::cmp::max(last_block_in_index, last_indexed_block)
            });

    tracing::debug!(
        "Starting near-lake-framework from {last_indexed_block} for indexer: {}",
        indexer.get_full_name(),
    );

    let lake_config = match &chain_id {
        ChainId::Mainnet => near_lake_framework::LakeConfigBuilder::default().mainnet(),
        ChainId::Testnet => near_lake_framework::LakeConfigBuilder::default().testnet(),
    }
    .start_block_height(last_indexed_block)
    .build()
    .context("Failed to build lake config")?;

    let (sender, mut stream) = near_lake_framework::streamer(lake_config);

    while let Some(streamer_message) = stream.recv().await {
        let block_height = streamer_message.block.header.height;
        last_indexed_block = block_height;

        let matches = crate::rules::reduce_indexer_rule_matches(
            &indexer.indexer_rule,
            &streamer_message,
            chain_id.clone(),
        );

        if !matches.is_empty() {
            crate::redis::xadd(
                redis_connection_manager,
                crate::redis::generate_historical_stream_key(&indexer.get_full_name()),
                &[("block_height", block_height)],
            )
            .await?;
        }
    }

    drop(sender);

    tracing::debug!(
        "Stopped block stream at {} for indexer: {}",
        last_indexed_block,
        indexer.get_full_name(),
    );

    Ok(())
}

pub async fn get_nearest_block_date(
    s3_client: &impl crate::s3_client::S3ClientTrait,
    block_height: u64,
    chain_id: &ChainId,
) -> anyhow::Result<chrono::DateTime<chrono::Utc>> {
    let bucket = match chain_id {
        ChainId::Mainnet => "near-lake-data-mainnet",
        ChainId::Testnet => "near-lake-data-testnet",
    };

    let mut current_block_height = block_height;
    let mut retry_count = 1;
    loop {
        let block_key = format!("{:0>12}/block.json", current_block_height);
        match s3_client.get_text_file(bucket, &block_key).await {
            Ok(text) => {
                let block: near_indexer_primitives::views::BlockView = serde_json::from_str(&text)?;
                return Ok(chrono::Utc.timestamp_nanos(block.header.timestamp_nanosec as i64));
            }

            Err(e) => {
                if e.root_cause()
                    .downcast_ref::<aws_sdk_s3::types::error::NoSuchKey>()
                    .is_some()
                {
                    retry_count += 1;
                    if retry_count > MAX_S3_RETRY_COUNT {
                        anyhow::bail!("Exceeded maximum retries to fetch block from S3");
                    }

                    tracing::debug!(
                        "Block {} not found on S3, attempting to fetch next block",
                        current_block_height
                    );
                    current_block_height += 1;
                    continue;
                }

                return Err(e).context("Failed to fetch block from S3");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate;

    mod get_near_block_date {
        use super::*;

        #[tokio::test]
        async fn gets_the_date_of_the_closest_block() {
            let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

            mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000106397175/block.json"),
            )
            .times(1)
            .returning(|_, _| {
                Ok(r#"{
                    "author": "someone",
                    "header": {
                      "approvals": [],
                      "block_merkle_root": "ERiC7AJ2zbVz1HJHThR5NWDDN9vByhwdjcVfivmpY5B",
                      "block_ordinal": 92102682,
                      "challenges_result": [],
                      "challenges_root": "11111111111111111111111111111111",
                      "chunk_headers_root": "MDiJxDyvUQaZRKmUwa5jgQuV6XjwVvnm4tDrajCxwvz",
                      "chunk_mask": [],
                      "chunk_receipts_root": "n84wEo7kTKTCJsyqBZ2jndhjrAMeJAXMwKvnJR7vCuy",
                      "chunk_tx_root": "D8j64GMKBMvUfvnuHtWUyDtMHM5mJ2pA4G5VmYYJvo5G",
                      "chunks_included": 4,
                      "epoch_id": "2RMQiomr6CSSwUWpmB62YohxHbfadrHfcsaa3FVb4J9x",
                      "epoch_sync_data_hash": null,
                      "gas_price": "100000000",
                      "hash": "FA1z9RVm9fX3g3mgP3NToZGwWeeXYn8bvZs4nwwTgCpD",
                      "height": 102162333,
                      "last_ds_final_block": "Ax2a3MSYuv2hgybnCbpNJMdYmPrHDHdA2hHTUrBkD915",
                      "last_final_block": "8xkwjn6Lb6UhMBhxcbVQBf3318GafkdaXoHA8Jako1nn",
                      "latest_protocol_version": 62,
                      "next_bp_hash": "dmW84aEj2iVJMLwJodJwTfAyeA1LJaHEthvnoAsvTPt",
                      "next_epoch_id": "C9TDDYthANoduoTBZS7WYDsBSe9XCm4M2F9hRoVXVXWY",
                      "outcome_root": "6WxzWLVp4b4bFbxHzu18apVfXLvHGKY7CHoqD2Eq3TFJ",
                      "prev_hash": "Ax2a3MSYuv2hgybnCbpNJMdYmPrHDHdA2hHTUrBkD915",
                      "prev_height": 102162332,
                      "prev_state_root": "Aq2ndkyDiwroUWN69Ema9hHtnr6dPHoEBRNyfmd8v4gB",
                      "random_value": "7ruuMyDhGtTkYaCGYMy7PirPiM79DXa8GhVzQW1pHRoz",
                      "rent_paid": "0",
                      "signature": "ed25519:5gYYaWHkAEK5etB8tDpw7fmehkoYSprUxKPygaNqmhVDFCMkA1n379AtL1BBkQswLAPxWs1BZvypFnnLvBtHRknm",
                      "timestamp": 1695921400989555700,
                      "timestamp_nanosec": "1695921400989555820",
                      "total_supply": "1155783047679681223245725102954966",
                      "validator_proposals": [],
                      "validator_reward": "0"
                    },
                    "chunks": []
                }"#
                .to_string())
            });

            let block_date = get_nearest_block_date(&mock_s3_client, 106397175, &ChainId::Mainnet)
                .await
                .unwrap();

            assert_eq!(
                block_date,
                chrono::Utc.timestamp_nanos(1695921400989555820_i64)
            );
        }

        #[tokio::test]
        async fn retires_if_a_block_doesnt_exist() {
            let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

            mock_s3_client
                .expect_get_text_file()
                .with(
                    predicate::eq("near-lake-data-mainnet"),
                    predicate::eq("000106397175/block.json"),
                )
                .times(1)
                .returning(|_, _| {
                    Err(anyhow::anyhow!(
                        aws_sdk_s3::types::error::NoSuchKey::builder().build()
                    ))
                });
            mock_s3_client
                .expect_get_text_file()
                .with(
                    predicate::eq("near-lake-data-mainnet"),
                    predicate::eq("000106397176/block.json"),
                )
                .times(1)
                .returning(|_, _| {
                    Ok(r#"{
                        "author": "someone",
                        "header": {
                          "approvals": [],
                          "block_merkle_root": "ERiC7AJ2zbVz1HJHThR5NWDDN9vByhwdjcVfivmpY5B",
                          "block_ordinal": 92102682,
                          "challenges_result": [],
                          "challenges_root": "11111111111111111111111111111111",
                          "chunk_headers_root": "MDiJxDyvUQaZRKmUwa5jgQuV6XjwVvnm4tDrajCxwvz",
                          "chunk_mask": [],
                          "chunk_receipts_root": "n84wEo7kTKTCJsyqBZ2jndhjrAMeJAXMwKvnJR7vCuy",
                          "chunk_tx_root": "D8j64GMKBMvUfvnuHtWUyDtMHM5mJ2pA4G5VmYYJvo5G",
                          "chunks_included": 4,
                          "epoch_id": "2RMQiomr6CSSwUWpmB62YohxHbfadrHfcsaa3FVb4J9x",
                          "epoch_sync_data_hash": null,
                          "gas_price": "100000000",
                          "hash": "FA1z9RVm9fX3g3mgP3NToZGwWeeXYn8bvZs4nwwTgCpD",
                          "height": 102162333,
                          "last_ds_final_block": "Ax2a3MSYuv2hgybnCbpNJMdYmPrHDHdA2hHTUrBkD915",
                          "last_final_block": "8xkwjn6Lb6UhMBhxcbVQBf3318GafkdaXoHA8Jako1nn",
                          "latest_protocol_version": 62,
                          "next_bp_hash": "dmW84aEj2iVJMLwJodJwTfAyeA1LJaHEthvnoAsvTPt",
                          "next_epoch_id": "C9TDDYthANoduoTBZS7WYDsBSe9XCm4M2F9hRoVXVXWY",
                          "outcome_root": "6WxzWLVp4b4bFbxHzu18apVfXLvHGKY7CHoqD2Eq3TFJ",
                          "prev_hash": "Ax2a3MSYuv2hgybnCbpNJMdYmPrHDHdA2hHTUrBkD915",
                          "prev_height": 102162332,
                          "prev_state_root": "Aq2ndkyDiwroUWN69Ema9hHtnr6dPHoEBRNyfmd8v4gB",
                          "random_value": "7ruuMyDhGtTkYaCGYMy7PirPiM79DXa8GhVzQW1pHRoz",
                          "rent_paid": "0",
                          "signature": "ed25519:5gYYaWHkAEK5etB8tDpw7fmehkoYSprUxKPygaNqmhVDFCMkA1n379AtL1BBkQswLAPxWs1BZvypFnnLvBtHRknm",
                          "timestamp": 1695921400989555700,
                          "timestamp_nanosec": "1695921400989555820",
                          "total_supply": "1155783047679681223245725102954966",
                          "validator_proposals": [],
                          "validator_reward": "0"
                        },
                        "chunks": []
                    }"#
                    .to_string())
                });

            let block_date = get_nearest_block_date(&mock_s3_client, 106397175, &ChainId::Mainnet)
                .await
                .unwrap();

            assert_eq!(
                block_date,
                chrono::Utc.timestamp_nanos(1695921400989555820_i64)
            );
        }

        #[tokio::test]
        async fn exits_if_maximum_retries_exceeded() {
            let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

            mock_s3_client
                .expect_get_text_file()
                .times(MAX_S3_RETRY_COUNT as usize)
                .returning(|_, _| {
                    Err(anyhow::anyhow!(
                        aws_sdk_s3::types::error::NoSuchKey::builder().build()
                    ))
                });

            let result =
                get_nearest_block_date(&mock_s3_client, 106397175, &ChainId::Mainnet).await;

            assert!(result.is_err());
        }
    }
}
