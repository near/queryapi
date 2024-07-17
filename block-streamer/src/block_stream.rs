use std::cmp::Ordering;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::Poll;

use anyhow::Context;
use futures::StreamExt;
use near_lake_framework::near_indexer_primitives;
use registry_types::Rule;
use tokio::task::JoinHandle;

use crate::indexer_config::IndexerConfig;
use crate::lake_s3_client::SharedLakeS3Client;
use crate::metrics;
use crate::receiver_blocks::ReceiverBlocksProcessor;
use crate::redis::RedisClient;
use crate::rules::types::ChainId;

/// The number of blocks to prefetch within `near-lake-framework`. The internal default is 100, but
/// we need this configurable for testing purposes.
const LAKE_PREFETCH_SIZE: usize = 100;
const MAX_STREAM_SIZE_WITH_CACHE: u64 = 100;
const MAX_STREAM_SIZE: u64 = 100;

#[pin_project::pin_project]
pub struct PollCounter<F> {
    #[pin]
    inner: F,
    indexer_name: String,
}

impl<F> PollCounter<F> {
    pub fn new(inner: F, indexer_name: String) -> Self {
        Self {
            inner,
            indexer_name,
        }
    }
}

impl<F: Future> Future for PollCounter<F> {
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        metrics::BLOCK_STREAM_UP
            .with_label_values(&[&self.indexer_name])
            .inc();

        let this = self.project();
        this.inner.poll(cx)
    }
}

pub struct Task {
    handle: JoinHandle<anyhow::Result<()>>,
    cancellation_token: tokio_util::sync::CancellationToken,
}

/// Represents the processing state of a block stream
#[derive(Clone)]
pub enum ProcessingState {
    /// Block Stream is not currently active but can be started. Either has not been started or was
    /// stopped.
    Idle,

    /// Block Stream is actively processing blocks.
    Active,

    /// Block Stream has been intentionally/internally paused due to some condition, i.e. back pressure on
    /// the Redis Stream.
    Paused,

    /// Block Stream has been halted due to an error or other condition. Must be manually
    /// restarted.
    Halted,
}

#[derive(Clone)]
pub struct BlockStreamHealth {
    pub processing_state: ProcessingState,
}

pub struct BlockStream {
    task: Option<Task>,
    pub indexer_config: IndexerConfig,
    pub chain_id: ChainId,
    pub version: u64,
    pub redis_stream: String,
    health: Arc<Mutex<BlockStreamHealth>>,
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
            health: Arc::new(Mutex::new(BlockStreamHealth {
                processing_state: ProcessingState::Idle,
            })),
        }
    }

    pub fn health(&self) -> anyhow::Result<BlockStreamHealth> {
        match self.health.lock() {
            Ok(health) => Ok(health.clone()),
            Err(e) => Err(anyhow::anyhow!("Failed to acquire health lock: {:?}", e)),
        }
    }

    fn start_health_monitoring_task(&self, redis: Arc<RedisClient>) {
        tokio::spawn({
            let config = self.indexer_config.clone();
            let health = self.health.clone();
            let redis_stream = self.redis_stream.clone();

            async move {
                let mut last_processed_block =
                    redis.get_last_processed_block(&config).await.unwrap();

                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                    let new_last_processed_block =
                        redis.get_last_processed_block(&config).await.unwrap();

                    let stream_size = redis.get_stream_length(redis_stream.clone()).await.unwrap();

                    match new_last_processed_block.cmp(&last_processed_block) {
                        Ordering::Less => {
                            tracing::error!(
                                account_id = config.account_id.as_str(),
                                function_name = config.function_name,
                                "Last processed block should not decrease"
                            );

                            health.lock().unwrap().processing_state = ProcessingState::Halted;
                        }
                        Ordering::Equal if stream_size >= Some(MAX_STREAM_SIZE) => {
                            health.lock().unwrap().processing_state = ProcessingState::Paused;
                        }
                        Ordering::Equal => {
                            health.lock().unwrap().processing_state = ProcessingState::Halted;
                        }
                        Ordering::Greater => {
                            health.lock().unwrap().processing_state = ProcessingState::Active;
                        }
                    };

                    last_processed_block = new_last_processed_block;
                }
            }
        });
    }

    fn start_block_stream_task(
        &self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        redis: Arc<RedisClient>,
        reciever_blocks_processor: Arc<ReceiverBlocksProcessor>,
        lake_s3_client: SharedLakeS3Client,
        cancellation_token: tokio_util::sync::CancellationToken,
    ) -> JoinHandle<anyhow::Result<()>> {
        tokio::spawn({
            let cancellation_token = cancellation_token.clone();
            let indexer_config = self.indexer_config.clone();
            let chain_id = self.chain_id.clone();
            let redis_stream = self.redis_stream.clone();

            async move {
                let block_stream_future = start_block_stream(
                    start_block_height,
                    &indexer_config,
                    redis,
                    reciever_blocks_processor,
                    lake_s3_client,
                    &chain_id,
                    LAKE_PREFETCH_SIZE,
                    redis_stream,
                );

                let block_stream_future =
                    PollCounter::new(block_stream_future, indexer_config.get_full_name());

                tokio::select! {
                    _ = cancellation_token.cancelled() => {
                        tracing::info!(
                            account_id = indexer_config.account_id.as_str(),
                            function_name = indexer_config.function_name,
                            "Cancelling block stream task",
                        );

                        Ok(())
                    },
                    result = block_stream_future => {
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
            }
        })
    }

    pub fn start(
        &mut self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        redis: Arc<RedisClient>,
        reciever_blocks_processor: Arc<ReceiverBlocksProcessor>,
        lake_s3_client: SharedLakeS3Client,
    ) -> anyhow::Result<()> {
        if self.task.is_some() {
            return Err(anyhow::anyhow!("BlockStreamer has already been started",));
        }

        let cancellation_token = tokio_util::sync::CancellationToken::new();

        self.start_health_monitoring_task(redis.clone());

        let handle = self.start_block_stream_task(
            start_block_height,
            redis,
            reciever_blocks_processor,
            lake_s3_client,
            cancellation_token.clone(),
        );

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

            // Fails if metric doesn't exist, i.e. task was never polled
            let _ = metrics::BLOCK_STREAM_UP
                .remove_label_values(&[&self.indexer_config.get_full_name()]);

            return Ok(());
        }

        Err(anyhow::anyhow!(
            "Attempted to cancel already cancelled, or not started, BlockStreamer"
        ))
    }
}

#[allow(clippy::too_many_arguments)]
#[tracing::instrument(
    name = "block_stream"
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
    redis: Arc<RedisClient>,
    reciever_blocks_processor: Arc<ReceiverBlocksProcessor>,
    lake_s3_client: SharedLakeS3Client,
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
        reciever_blocks_processor,
        redis.clone(),
        indexer,
        redis_stream.clone(),
    )
    .await
    .context("Failed while fetching and streaming bitmap indexer blocks")?;

    let last_indexed_near_lake_block = process_near_lake_blocks(
        last_bitmap_indexer_block,
        lake_s3_client,
        lake_prefetch_size,
        redis,
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
    reciever_blocks_processor: Arc<ReceiverBlocksProcessor>,
    redis: Arc<RedisClient>,
    indexer: &IndexerConfig,
    redis_stream: String,
) -> anyhow::Result<u64> {
    let contract_pattern: String = match &indexer.rule {
        Rule::ActionAny {
            affected_account_id,
            ..
        } => affected_account_id.to_owned(),
        Rule::ActionFunctionCall { .. } => {
            tracing::error!("ActionFunctionCall matching rule not yet supported for bitmap processing, function");
            return Ok(start_block_height);
        }
        Rule::Event { .. } => {
            tracing::error!(
                "Event matching rule not yet supported for bitmap processing, function"
            );
            return Ok(start_block_height);
        }
    };

    tracing::debug!(
        "Fetching block heights starting from {} from Bitmap Indexer",
        start_block_height,
    );

    if contract_pattern
        .split(',')
        .any(|account_id| account_id.trim().eq("*"))
    {
        tracing::debug!(
            "Skipping fetching block heights form bitmap idnexer due to presence of all account wildcard * in filter {}",
            contract_pattern
        );

        return Ok(start_block_height);
    }

    let matching_block_heights = reciever_blocks_processor
        .stream_matching_block_heights(start_block_height, contract_pattern);

    tokio::pin!(matching_block_heights);

    let mut last_published_block_height: u64 = start_block_height;

    while let Some(block_height_result) = matching_block_heights.next().await {
        match block_height_result {
            Ok(block_height) => {
                redis
                    .publish_block(indexer, redis_stream.clone(), block_height, MAX_STREAM_SIZE)
                    .await?;
                redis
                    .set_last_processed_block(indexer, block_height)
                    .await?;

                last_published_block_height = block_height;
            }
            Err(err) => {
                tracing::error!(
                    "Backfill using bitmap indexer failed unexpectedly: {:?}",
                    err
                );
                break;
            }
        }
    }

    Ok(last_published_block_height)
}

async fn process_near_lake_blocks(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    lake_s3_client: SharedLakeS3Client,
    lake_prefetch_size: usize,
    redis: Arc<RedisClient>,
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

        redis
            .set_last_processed_block(indexer, block_height)
            .await?;

        let matches = crate::rules::reduce_indexer_rule_matches(
            &indexer.rule,
            &streamer_message,
            chain_id.clone(),
        );

        if !matches.is_empty() {
            if let Ok(Some(stream_length)) = redis.get_stream_length(redis_stream.clone()).await {
                if stream_length <= MAX_STREAM_SIZE_WITH_CACHE {
                    redis.cache_streamer_message(&streamer_message).await?;
                }
            }

            redis
                .publish_block(indexer, redis_stream.clone(), block_height, MAX_STREAM_SIZE)
                .await?;
        }
    }

    drop(sender);

    Ok(last_indexed_block)
}

#[cfg(test)]
mod tests {
    use super::*;

    use mockall::predicate;
    use near_lake_framework::s3_client::GetObjectBytesError;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

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
                Ok(crate::test_utils::generate_block_with_timestamp(
                    "2023-12-09",
                ))
            });

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client
            .expect_get_bitmaps_exact()
            .with(
                predicate::eq(vec![contract_filter.to_owned()]),
                predicate::eq(crate::test_utils::utc_date_time_from_date_string(
                    "2023-12-09",
                )),
            )
            .returning(|_, _| {
                Ok(vec![
                    crate::graphql::client::get_bitmaps_exact::GetBitmapsExactDataplatformNearReceiverBlocksBitmaps {
                        first_block_height: 107503702,
                        bitmap: "oA==".to_string(),
                    }
                ])
            });

        mock_graphql_client
            .expect_get_bitmaps_exact()
            .returning(|_, _| Ok(vec![]));

        let mock_reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);

        let last_processed_block_height = Arc::new(AtomicU64::new(0));
        let last_processed_block_height_clone = last_processed_block_height.clone();

        let mut mock_redis = crate::redis::RedisClient::default();
        mock_redis
            .expect_publish_block()
            .with(
                predicate::always(),
                predicate::eq("stream key".to_string()),
                predicate::in_iter([107503702, 107503703, 107503705]),
                predicate::always(),
            )
            .returning(|_, _, _, _| Ok(()))
            .times(3);
        mock_redis
            .expect_set_last_processed_block()
            .with(
                predicate::always(),
                predicate::in_iter([107503702, 107503703, 107503704, 107503705]),
            )
            .returning(move |_, height| {
                last_processed_block_height_clone.store(height, Ordering::Relaxed);
                Ok(())
            })
            .times(4);
        mock_redis
            .expect_cache_streamer_message()
            .with(predicate::always())
            .returning(|_| Ok(()));
        mock_redis
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

        let mut block_stream = BlockStream::new(
            indexer_config,
            ChainId::Mainnet,
            1,
            "stream key".to_string(),
        );

        block_stream
            .start(
                91940840,
                std::sync::Arc::new(mock_redis),
                std::sync::Arc::new(mock_reciever_blocks_processor),
                mock_lake_s3_client,
            )
            .unwrap();

        loop {
            if last_processed_block_height.load(Ordering::Relaxed) >= 107503705 {
                break;
            }

            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }

        block_stream.cancel().await.unwrap();
    }

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
            .returning(|_, _| Ok(vec![107503704.to_string(), 107503705.to_string()]));

        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet".to_string()),
                predicate::eq("000107503704/block.json"),
            )
            .returning(move |_, _| {
                Ok(crate::test_utils::generate_block_with_timestamp(
                    &chrono::Utc::now().format("%Y-%m-%d").to_string(),
                ))
            });

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client
            .expect_get_bitmaps_exact()
            .returning(|_, _| Ok(vec![]));

        let mock_reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);

        let last_processed_block_height = Arc::new(AtomicU64::new(0));
        let last_processed_block_height_clone = last_processed_block_height.clone();

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client
            .expect_publish_block()
            .with(
                predicate::always(),
                predicate::eq("stream key".to_string()),
                predicate::in_iter([107503705]),
                predicate::always(),
            )
            .returning(|_, _, _, _| Ok(()))
            .times(1);
        mock_redis_client
            .expect_set_last_processed_block()
            .with(
                predicate::always(),
                predicate::in_iter([107503704, 107503705]),
            )
            .returning(move |_, height| {
                last_processed_block_height_clone.store(height, Ordering::Relaxed);
                Ok(())
            })
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

        let mut block_stream = BlockStream::new(
            indexer_config,
            ChainId::Mainnet,
            1,
            "stream key".to_string(),
        );

        block_stream
            .start(
                107503704,
                Arc::new(mock_redis_client),
                Arc::new(mock_reciever_blocks_processor),
                mock_lake_s3_client,
            )
            .unwrap();

        loop {
            if last_processed_block_height.load(Ordering::Relaxed) >= 107503705 {
                break;
            }

            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }

        block_stream.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn skips_bitmap_for_star_filter() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client.expect_get_text_file().never();

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client.expect_get_bitmaps_exact().never();

        let mock_reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);

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
            Arc::new(mock_reciever_blocks_processor),
            Arc::new(mock_redis_client),
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

        let mock_reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);

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
            Arc::new(mock_reciever_blocks_processor),
            Arc::new(mock_redis_client),
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

        let mock_reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);

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
            Arc::new(mock_reciever_blocks_processor),
            Arc::new(mock_redis_client),
            &indexer_config,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }
}
