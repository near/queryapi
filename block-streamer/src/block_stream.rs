use anyhow::Context;
use near_lake_framework::near_indexer_primitives;
use tokio::task::JoinHandle;

use crate::indexer_config::IndexerConfig;
use crate::rules::types::ChainId;
use crate::{bitmap_processor, delta_lake_client, metrics};
use futures::StreamExt;
use registry_types::Rule;

/// The number of blocks to prefetch within `near-lake-framework`. The internal default is 100, but
/// we need this configurable for testing purposes.
const LAKE_PREFETCH_SIZE: usize = 100;
const MAX_STREAM_SIZE_WITH_CACHE: u64 = 100;
const DELTA_LAKE_SKIP_ACCOUNTS: [&str; 4] = ["*", "*.near", "*.kaiching", "*.tg"];

pub struct Task {
    handle: JoinHandle<anyhow::Result<()>>,
    cancellation_token: tokio_util::sync::CancellationToken,
}

pub struct BlockStream {
    task: Option<Task>,
    pub indexer_config: IndexerConfig,
    pub chain_id: ChainId,
    pub version: u64,
    pub redis_stream: String,
}

impl BlockStream {
    pub fn new(
        indexer_config: IndexerConfig,
        chain_id: ChainId,
        version: u64,
        redis_stream: String,
    ) -> Self {
        Self {
            task: None,
            indexer_config,
            chain_id,
            version,
            redis_stream,
        }
    }

    pub fn start(
        &mut self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        redis_client: std::sync::Arc<crate::redis::RedisClient>,
        bitmap_processor: std::sync::Arc<crate::bitmap_processor::BitmapProcessor>,
        lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    ) -> anyhow::Result<()> {
        if self.task.is_some() {
            return Err(anyhow::anyhow!("BlockStreamer has already been started",));
        }

        let cancellation_token = tokio_util::sync::CancellationToken::new();
        let cancellation_token_clone = cancellation_token.clone();

        let indexer_config = self.indexer_config.clone();
        let chain_id = self.chain_id.clone();
        let redis_stream = self.redis_stream.clone();

        let handle = tokio::spawn(async move {
            tokio::select! {
                _ = cancellation_token_clone.cancelled() => {
                    tracing::info!(
                        account_id = indexer_config.account_id.as_str(),
                        function_name = indexer_config.function_name,
                        "Cancelling block stream task",
                    );

                    Ok(())
                },
                result = start_block_stream(
                    start_block_height,
                    &indexer_config,
                    redis_client,
                    bitmap_processor,
                    lake_s3_client,
                    &chain_id,
                    LAKE_PREFETCH_SIZE,
                    redis_stream
                ) => {
                    result.map_err(|err| {
                        tracing::error!(
                            account_id = indexer_config.account_id.as_str(),
                            function_name = indexer_config.function_name,
                            "Block stream task stopped due to error: {:?}",
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
}

#[allow(clippy::too_many_arguments)]
#[tracing::instrument(
    skip_all,
    fields(
        account_id = indexer.account_id.as_str(),
        function_name = indexer.function_name,
        start_block_height = start_block_height,
        redis_stream = redis_stream
    )
)]
pub(crate) async fn start_block_stream(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    indexer: &IndexerConfig,
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    bitmap_processor: std::sync::Arc<crate::bitmap_processor::BitmapProcessor>,
    lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    chain_id: &ChainId,
    lake_prefetch_size: usize,
    redis_stream: String,
) -> anyhow::Result<()> {
    tracing::info!("Starting block stream",);

    metrics::PUBLISHED_BLOCKS_COUNT
        .with_label_values(&[&indexer.get_full_name()])
        .reset();

    let last_bitmap_indexer_block = process_bitmap_indexer_blocks(
        start_block_height,
        bitmap_processor,
        redis_client.clone(),
        indexer,
        redis_stream.clone(),
    )
    .await
    .context("Failed while fetching and streaming bitmap indexer blocks")?;

    let last_indexed_near_lake_block = process_near_lake_blocks(
        last_bitmap_indexer_block,
        lake_s3_client,
        lake_prefetch_size,
        redis_client,
        indexer,
        redis_stream,
        chain_id,
    )
    .await
    .context("Failed during Near Lake processing")?;

    tracing::debug!(
        last_indexed_block = last_indexed_near_lake_block,
        "Stopped block stream",
    );

    Ok(())
}

async fn process_bitmap_indexer_blocks(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    bitmap_processor: std::sync::Arc<crate::bitmap_processor::BitmapProcessor>,
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    indexer: &IndexerConfig,
    redis_stream: String,
) -> anyhow::Result<u64> {
    let mut last_published_block_height: u64 = start_block_height;

    let contract_pattern: String = match &indexer.rule {
        Rule::ActionAny {
            affected_account_id,
            ..
        } => {
            if affected_account_id
                .split(',')
                .any(|account_id| account_id.trim().eq("*"))
            {
                tracing::debug!(
                    "Skipping fetching block heights form bitmap idnexer due to presence of all account wildcard * in filter {}",
                    affected_account_id
                );
                return Ok(start_block_height);
            }
            tracing::debug!(
                "Fetching block heights starting from {} from Bitmap Indexer",
                start_block_height,
            );

            anyhow::Ok(affected_account_id.to_owned())
        }
        Rule::ActionFunctionCall { .. } => {
            tracing::error!("ActionFunctionCall matching rule not yet supported for delta lake processing, function: {:?} {:?}", indexer.account_id, indexer.function_name);
            Ok("".to_string())
        }
        Rule::Event { .. } => {
            tracing::error!("Event matching rule not yet supported for delta lake processing, function {:?} {:?}", indexer.account_id, indexer.function_name);
            Ok("".to_string())
        }
    }?;

    if contract_pattern == "".to_string() {
        return Ok(start_block_height);
    }

    let matching_block_heights =
        bitmap_processor.stream_matching_block_heights(start_block_height, contract_pattern);
    tokio::pin!(matching_block_heights);
    while let Some(Ok(block_height)) = matching_block_heights.next().await {
        let block_height = block_height.clone();
        redis_client
            .publish_block(indexer, redis_stream.clone(), block_height)
            .await?;
        redis_client
            .set_last_processed_block(indexer, block_height)
            .await?;
        last_published_block_height = block_height;
    }

    Ok(last_published_block_height)
}

async fn process_near_lake_blocks(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    lake_prefetch_size: usize,
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    indexer: &IndexerConfig,
    redis_stream: String,
    chain_id: &ChainId,
) -> anyhow::Result<u64> {
    tracing::debug!(start_block_height, "Starting near-lake-framework",);

    let lake_config = match &chain_id {
        ChainId::Mainnet => near_lake_framework::LakeConfigBuilder::default().mainnet(),
        ChainId::Testnet => near_lake_framework::LakeConfigBuilder::default().testnet(),
    }
    .s3_client(lake_s3_client)
    .start_block_height(start_block_height)
    .blocks_preload_pool_size(lake_prefetch_size)
    .build()
    .context("Failed to build lake config")?;

    let mut last_indexed_block = start_block_height;

    let (sender, mut stream) = near_lake_framework::streamer(lake_config);

    while let Some(streamer_message) = stream.recv().await {
        let block_height = streamer_message.block.header.height;
        last_indexed_block = block_height;

        redis_client
            .set_last_processed_block(indexer, block_height)
            .await?;

        let matches = crate::rules::reduce_indexer_rule_matches(
            &indexer.rule,
            &streamer_message,
            chain_id.clone(),
        );

        if !matches.is_empty() {
            if let Ok(Some(stream_length)) =
                redis_client.get_stream_length(redis_stream.clone()).await
            {
                if stream_length <= MAX_STREAM_SIZE_WITH_CACHE {
                    redis_client
                        .cache_streamer_message(&streamer_message)
                        .await?;
                }
            }

            redis_client
                .publish_block(indexer, redis_stream.clone(), block_height)
                .await?;
        }

        if block_height == 107503705 {
            drop(sender);
            return Ok(last_indexed_block);
        }
    }

    drop(sender);

    Ok(last_indexed_block)
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Arc;

    use chrono::TimeZone;
    use mockall::predicate;
    use near_lake_framework::s3_client::GetObjectBytesError;

    fn utc_date_time_from_date_string(date: &str) -> chrono::DateTime<chrono::Utc> {
        let naive_date_time: chrono::NaiveDateTime =
            chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .unwrap()
                .and_hms_opt(0, 0, 0)
                .unwrap();
        chrono::TimeZone::from_utc_datetime(&chrono::Utc, &naive_date_time)
    }

    fn generate_block_with_timestamp(date: &str) -> String {
        let naive_date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();

        let date_time_utc = chrono::Utc.from_utc_datetime(&naive_date).timestamp() * 1_000_000_000;

        format!(
            r#"{{
                "author": "someone",
                "header": {{
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
                  "timestamp_nanosec": "{}",
                  "total_supply": "1155783047679681223245725102954966",
                  "validator_proposals": [],
                  "validator_reward": "0"
                }},
                "chunks": []
            }}"#,
            date_time_utc
        )
    }

    fn exact_query_result(
        first_block_height: i64,
        bitmap: &str,
    ) -> crate::graphql::client::get_bitmaps_exact::GetBitmapsExactDarunrsNearBitmapV5ActionsIndex
    {
        crate::graphql::client::get_bitmaps_exact::GetBitmapsExactDarunrsNearBitmapV5ActionsIndex {
            first_block_height,
            bitmap: bitmap.to_string(),
        }
    }

    fn wildcard_query_result(
        first_block_height: i64,
        bitmap: &str
    ) -> crate::graphql::client::get_bitmaps_wildcard::GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex{
        crate::graphql::client::get_bitmaps_wildcard::GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex {
            first_block_height,
            bitmap: bitmap.to_string(),
        }
    }

    // FIX: near lake framework now infinitely retires - we need a way to stop it to allow the test
    // to finish
    #[ignore]
    #[tokio::test]
    async fn adds_matching_blocks_from_bitmap_and_lake() {
        let contract_filter = "queryapi.dataplatform.near";
        let mut mock_lake_s3_client = crate::lake_s3_client::SharedLakeS3Client::default();

        mock_lake_s3_client
            .expect_get_object_bytes()
            .returning(|_, prefix| {
                let path = format!("{}/data/{}", env!("CARGO_MANIFEST_DIR"), prefix);

                std::fs::read(path).map_err(|e| GetObjectBytesError(Arc::new(e)))
            });

        mock_lake_s3_client
            .expect_list_common_prefixes()
            .returning(|_, _| Ok(vec![107503704.to_string(), 107503705.to_string()]));

        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet".to_string()),
                predicate::eq("000091940840/block.json"),
            )
            .returning(move |_, _| {
                Ok(generate_block_with_timestamp(
                    &chrono::Utc::now().format("%Y-%m-%d").to_string(),
                ))
            });

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client
            .expect_get_bitmaps_exact()
            .with(
                predicate::eq(vec![contract_filter.to_owned()]),
                predicate::eq(utc_date_time_from_date_string("2023-12-09")),
            )
            .returning(|_, _| Ok(vec![exact_query_result(107503702, "oA==")]));

        mock_graphql_client
            .expect_get_bitmaps_exact()
            .returning(|_, _| Ok(vec![exact_query_result(107503702, "oA==")]));

        let mock_bitmap_processor =
            crate::bitmap_processor::BitmapProcessor::new(mock_graphql_client, mock_s3_client);

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client
            .expect_publish_block()
            .with(
                predicate::always(),
                predicate::eq("stream key".to_string()),
                predicate::in_iter([107503702, 107503703, 107503705]),
            )
            .returning(|_, _, _| Ok(()))
            .times(3);
        mock_redis_client
            .expect_set_last_processed_block()
            .with(
                predicate::always(),
                predicate::in_iter([107503702, 107503703, 107503704, 107503705]),
            )
            .returning(|_, _| Ok(()))
            .times(4);
        mock_redis_client
            .expect_cache_streamer_message()
            .with(predicate::always())
            .returning(|_| Ok(()));
        mock_redis_client
            .expect_get_stream_length()
            .with(predicate::eq("stream key".to_string()))
            .returning(|_| Ok(Some(10)));

        let indexer_config = crate::indexer_config::IndexerConfig {
            account_id: near_indexer_primitives::types::AccountId::try_from(
                "morgs.near".to_string(),
            )
            .unwrap(),
            function_name: "test".to_string(),
            rule: registry_types::Rule::ActionAny {
                affected_account_id: contract_filter.to_owned(),
                status: registry_types::Status::Success,
            },
        };

        start_block_stream(
            91940840,
            &indexer_config,
            std::sync::Arc::new(mock_redis_client),
            std::sync::Arc::new(mock_bitmap_processor),
            mock_lake_s3_client,
            &ChainId::Mainnet,
            1,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }

    // FIX: near lake framework now infinitely retires - we need a way to stop it to allow the test
    // to finish
    #[ignore]
    #[tokio::test]
    async fn skips_caching_of_lake_block_over_stream_size_limit() {
        let mut mock_lake_s3_client = crate::lake_s3_client::SharedLakeS3Client::default();

        mock_lake_s3_client
            .expect_get_object_bytes()
            .returning(|_, prefix| {
                let path = format!("{}/data/{}", env!("CARGO_MANIFEST_DIR"), prefix);

                std::fs::read(path).map_err(|e| GetObjectBytesError(Arc::new(e)))
            });

        mock_lake_s3_client
            .expect_list_common_prefixes()
            .returning(|_, _| Ok(vec![]));

        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet".to_string()),
                predicate::eq("000107503704/block.json"),
            )
            .returning(move |_, _| {
                Ok(generate_block_with_timestamp(
                    &chrono::Utc::now().format("%Y-%m-%d").to_string(),
                ))
            });

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client
            .expect_get_bitmaps_exact()
            .returning(|_, _| Ok(vec![]));

        let mock_bitmap_processor =
            crate::bitmap_processor::BitmapProcessor::new(mock_graphql_client, mock_s3_client);

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client
            .expect_publish_block()
            .with(
                predicate::always(),
                predicate::eq("stream key".to_string()),
                predicate::in_iter([107503705]),
            )
            .returning(|_, _, _| Ok(()))
            .times(1);
        mock_redis_client
            .expect_set_last_processed_block()
            .with(
                predicate::always(),
                predicate::in_iter([107503704, 107503705]),
            )
            .returning(|_, _| Ok(()))
            .times(2);
        mock_redis_client
            .expect_cache_streamer_message()
            .with(predicate::always())
            .never();
        mock_redis_client
            .expect_get_stream_length()
            .with(predicate::eq("stream key".to_string()))
            .returning(|_| Ok(Some(200)));

        let indexer_config = crate::indexer_config::IndexerConfig {
            account_id: near_indexer_primitives::types::AccountId::try_from(
                "morgs.near".to_string(),
            )
            .unwrap(),
            function_name: "test".to_string(),
            rule: registry_types::Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: registry_types::Status::Success,
            },
        };

        start_block_stream(
            107503704,
            &indexer_config,
            std::sync::Arc::new(mock_redis_client),
            std::sync::Arc::new(mock_bitmap_processor),
            mock_lake_s3_client,
            &ChainId::Mainnet,
            1,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn skips_bitmap_for_star_filter() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client.expect_get_text_file().never();

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client.expect_get_bitmaps_exact().never();

        let mock_bitmap_processor =
            crate::bitmap_processor::BitmapProcessor::new(mock_graphql_client, mock_s3_client);

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client.expect_publish_block().never();
        mock_redis_client.expect_set_last_processed_block().never();

        let indexer_config = crate::indexer_config::IndexerConfig {
            account_id: near_indexer_primitives::types::AccountId::try_from(
                "morgs.near".to_string(),
            )
            .unwrap(),
            function_name: "test".to_string(),
            rule: registry_types::Rule::ActionAny {
                affected_account_id: "*".to_string(),
                status: registry_types::Status::Success,
            },
        };

        process_bitmap_indexer_blocks(
            107503704,
            std::sync::Arc::new(mock_bitmap_processor),
            std::sync::Arc::new(mock_redis_client),
            &indexer_config,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn skips_bitmap_for_multiple_star_filter() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client.expect_get_text_file().never();

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client.expect_get_bitmaps_exact().never();

        let mock_bitmap_processor =
            crate::bitmap_processor::BitmapProcessor::new(mock_graphql_client, mock_s3_client);

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client.expect_publish_block().never();
        mock_redis_client.expect_set_last_processed_block().never();

        let indexer_config = crate::indexer_config::IndexerConfig {
            account_id: near_indexer_primitives::types::AccountId::try_from(
                "morgs.near".to_string(),
            )
            .unwrap(),
            function_name: "test".to_string(),
            rule: registry_types::Rule::ActionAny {
                affected_account_id: "*.tg, *".to_string(),
                status: registry_types::Status::Success,
            },
        };

        process_bitmap_indexer_blocks(
            107503704,
            std::sync::Arc::new(mock_bitmap_processor),
            std::sync::Arc::new(mock_redis_client),
            &indexer_config,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn skips_bitmap_for_star_filter_after_normal_account() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client.expect_get_text_file().never();

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client.expect_get_bitmaps_exact().never();

        let mock_bitmap_processor =
            crate::bitmap_processor::BitmapProcessor::new(mock_graphql_client, mock_s3_client);

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client.expect_publish_block().never();
        mock_redis_client.expect_set_last_processed_block().never();

        let indexer_config = crate::indexer_config::IndexerConfig {
            account_id: near_indexer_primitives::types::AccountId::try_from(
                "morgs.near".to_string(),
            )
            .unwrap(),
            function_name: "test".to_string(),
            rule: registry_types::Rule::ActionAny {
                affected_account_id: "someone.tg, *".to_string(),
                status: registry_types::Status::Success,
            },
        };

        process_bitmap_indexer_blocks(
            107503704,
            std::sync::Arc::new(mock_bitmap_processor),
            std::sync::Arc::new(mock_redis_client),
            &indexer_config,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }
}
