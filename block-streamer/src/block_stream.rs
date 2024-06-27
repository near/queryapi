use std::future::Future;
use std::pin::Pin;
use std::task::Poll;

use anyhow::Context;
use near_lake_framework::near_indexer_primitives;
use tokio::task::JoinHandle;

use crate::indexer_config::IndexerConfig;
use crate::metrics;
use crate::rules::types::ChainId;
use registry_types::Rule;

/// The number of blocks to prefetch within `near-lake-framework`. The internal default is 100, but
/// we need this configurable for testing purposes.
const LAKE_PREFETCH_SIZE: usize = 100;
const MAX_STREAM_SIZE_WITH_CACHE: u64 = 100;
const DELTA_LAKE_SKIP_ACCOUNTS: [&str; 4] = ["*", "*.near", "*.kaiching", "*.tg"];
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
        redis: std::sync::Arc<crate::redis::RedisClient>,
        delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
        lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    ) -> anyhow::Result<()> {
        if self.task.is_some() {
            return Err(anyhow::anyhow!("BlockStreamer has already been started",));
        }

        let cancellation_token = tokio_util::sync::CancellationToken::new();

        let handle = tokio::spawn({
            let cancellation_token = cancellation_token.clone();
            let indexer_config = self.indexer_config.clone();
            let chain_id = self.chain_id.clone();
            let redis_stream = self.redis_stream.clone();

            async move {
                let block_stream_future = start_block_stream(
                    start_block_height,
                    &indexer_config,
                    redis,
                    delta_lake_client,
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

            metrics::BLOCK_STREAM_UP
                .remove_label_values(&[&self.indexer_config.get_full_name()])?;

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
    redis: std::sync::Arc<crate::redis::RedisClient>,
    delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
    lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    chain_id: &ChainId,
    lake_prefetch_size: usize,
    redis_stream: String,
) -> anyhow::Result<()> {
    tracing::info!("Starting block stream",);

    metrics::PUBLISHED_BLOCKS_COUNT
        .with_label_values(&[&indexer.get_full_name()])
        .reset();

    let last_indexed_delta_lake_block = process_delta_lake_blocks(
        start_block_height,
        delta_lake_client,
        redis.clone(),
        indexer,
        redis_stream.clone(),
    )
    .await
    .context("Failed during Delta Lake processing")?;

    let last_indexed_near_lake_block = process_near_lake_blocks(
        last_indexed_delta_lake_block,
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

async fn process_delta_lake_blocks(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
    redis: std::sync::Arc<crate::redis::RedisClient>,
    indexer: &IndexerConfig,
    redis_stream: String,
) -> anyhow::Result<u64> {
    let latest_block_metadata = delta_lake_client.get_latest_block_metadata().await?;
    let last_indexed_block_from_metadata = latest_block_metadata
        .last_indexed_block
        .parse::<near_indexer_primitives::types::BlockHeight>()
        .context("Failed to parse Delta Lake metadata")?;

    if start_block_height >= last_indexed_block_from_metadata {
        return Ok(start_block_height);
    }

    let blocks_from_index = match &indexer.rule {
        Rule::ActionAny {
            affected_account_id,
            ..
        } => {
            if affected_account_id
                .split(',')
                .any(|account_id| DELTA_LAKE_SKIP_ACCOUNTS.contains(&account_id.trim()))
            {
                tracing::debug!(
                    "Skipping fetching index files from delta lake due to wildcard contract filter present in {}",
                    affected_account_id
                );
                return Ok(start_block_height);
            }
            tracing::debug!(
                "Fetching block heights starting from {} from delta lake",
                start_block_height,
            );

            delta_lake_client
                .list_matching_block_heights(start_block_height, affected_account_id)
                .await
        }
        Rule::ActionFunctionCall { .. } => {
            tracing::error!("ActionFunctionCall matching rule not yet supported for delta lake processing, function: {:?} {:?}", indexer.account_id, indexer.function_name);
            Ok(vec![])
        }
        Rule::Event { .. } => {
            tracing::error!("Event matching rule not yet supported for delta lake processing, function {:?} {:?}", indexer.account_id, indexer.function_name);
            Ok(vec![])
        }
    }?;

    tracing::debug!(
        "Flushing {} block heights from index files to Redis Stream",
        blocks_from_index.len(),
    );

    for block_height in &blocks_from_index {
        let block_height = block_height.to_owned();
        redis
            .publish_block(indexer, redis_stream.clone(), block_height, MAX_STREAM_SIZE)
            .await?;
        redis
            .set_last_processed_block(indexer, block_height)
            .await?;
    }

    let last_indexed_block =
        blocks_from_index
            .last()
            .map_or(last_indexed_block_from_metadata, |&last_block_in_index| {
                // Check for the case where index files are written right after we fetch the last_indexed_block metadata
                std::cmp::max(last_block_in_index, last_indexed_block_from_metadata)
            });

    Ok(last_indexed_block)
}

async fn process_near_lake_blocks(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    lake_prefetch_size: usize,
    redis: std::sync::Arc<crate::redis::RedisClient>,
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

    use std::sync::Arc;

    use mockall::predicate;
    use near_lake_framework::s3_client::GetObjectBytesError;

    // FIX: near lake framework now infinitely retires - we need a way to stop it to allow the test
    // to finish
    #[ignore]
    #[tokio::test]
    async fn adds_matching_blocks_from_index_and_lake() {
        let mut mock_lake_s3_client = crate::lake_s3_client::SharedLakeS3Client::default();

        mock_lake_s3_client
            .expect_get_object_bytes()
            .returning(|_, prefix| {
                let path = format!("{}/data/{}", env!("CARGO_MANIFEST_DIR"), prefix);

                std::fs::read(path).map_err(|e| GetObjectBytesError(Arc::new(e)))
            });

        mock_lake_s3_client
            .expect_list_common_prefixes()
            .with(predicate::always(), predicate::eq(107503704.to_string()))
            .returning(|_, _| Ok(vec![107503704.to_string(), 107503705.to_string()]));

        let mut mock_delta_lake_client = crate::delta_lake_client::DeltaLakeClient::default();
        mock_delta_lake_client
            .expect_get_latest_block_metadata()
            .returning(|| {
                Ok(crate::delta_lake_client::LatestBlockMetadata {
                    last_indexed_block: "107503703".to_string(),
                    processed_at_utc: "".to_string(),
                    first_indexed_block: "".to_string(),
                    last_indexed_block_date: "".to_string(),
                    first_indexed_block_date: "".to_string(),
                })
            });
        mock_delta_lake_client
            .expect_list_matching_block_heights()
            .returning(|_, _| Ok(vec![107503702, 107503703]));

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
            .returning(|_, _| Ok(()))
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
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: registry_types::Status::Success,
            },
        };

        start_block_stream(
            91940840,
            &indexer_config,
            std::sync::Arc::new(mock_redis),
            std::sync::Arc::new(mock_delta_lake_client),
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
        let mock_lake_s3_client = crate::lake_s3_client::SharedLakeS3Client::default();

        let mut mock_delta_lake_client = crate::delta_lake_client::DeltaLakeClient::default();
        mock_delta_lake_client
            .expect_get_latest_block_metadata()
            .returning(|| {
                Ok(crate::delta_lake_client::LatestBlockMetadata {
                    last_indexed_block: "107503700".to_string(),
                    processed_at_utc: "".to_string(),
                    first_indexed_block: "".to_string(),
                    last_indexed_block_date: "".to_string(),
                    first_indexed_block_date: "".to_string(),
                })
            });

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
            std::sync::Arc::new(mock_delta_lake_client),
            mock_lake_s3_client,
            &ChainId::Mainnet,
            1,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn skips_delta_lake_for_star_filter() {
        let mut mock_delta_lake_client = crate::delta_lake_client::DeltaLakeClient::default();
        mock_delta_lake_client
            .expect_get_latest_block_metadata()
            .returning(|| {
                Ok(crate::delta_lake_client::LatestBlockMetadata {
                    last_indexed_block: "107503700".to_string(),
                    processed_at_utc: "".to_string(),
                    first_indexed_block: "".to_string(),
                    last_indexed_block_date: "".to_string(),
                    first_indexed_block_date: "".to_string(),
                })
            });
        mock_delta_lake_client
            .expect_list_matching_block_heights()
            .never();

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

        process_delta_lake_blocks(
            107503704,
            std::sync::Arc::new(mock_delta_lake_client),
            std::sync::Arc::new(mock_redis_client),
            &indexer_config,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn skips_delta_lake_for_multiple_star_filter() {
        let mut mock_delta_lake_client = crate::delta_lake_client::DeltaLakeClient::default();
        mock_delta_lake_client
            .expect_get_latest_block_metadata()
            .returning(|| {
                Ok(crate::delta_lake_client::LatestBlockMetadata {
                    last_indexed_block: "107503700".to_string(),
                    processed_at_utc: "".to_string(),
                    first_indexed_block: "".to_string(),
                    last_indexed_block_date: "".to_string(),
                    first_indexed_block_date: "".to_string(),
                })
            });
        mock_delta_lake_client
            .expect_list_matching_block_heights()
            .never();

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
                affected_account_id: "*, *.tg".to_string(),
                status: registry_types::Status::Success,
            },
        };

        process_delta_lake_blocks(
            107503704,
            std::sync::Arc::new(mock_delta_lake_client),
            std::sync::Arc::new(mock_redis_client),
            &indexer_config,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn skips_delta_lake_for_star_filter_after_normal_account() {
        let mut mock_delta_lake_client = crate::delta_lake_client::DeltaLakeClient::default();
        mock_delta_lake_client
            .expect_get_latest_block_metadata()
            .returning(|| {
                Ok(crate::delta_lake_client::LatestBlockMetadata {
                    last_indexed_block: "107503700".to_string(),
                    processed_at_utc: "".to_string(),
                    first_indexed_block: "".to_string(),
                    last_indexed_block_date: "".to_string(),
                    first_indexed_block_date: "".to_string(),
                })
            });
        mock_delta_lake_client
            .expect_list_matching_block_heights()
            .never();

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
                affected_account_id: "someone.near, *.kaiching".to_string(),
                status: registry_types::Status::Success,
            },
        };

        process_delta_lake_blocks(
            107503704,
            std::sync::Arc::new(mock_delta_lake_client),
            std::sync::Arc::new(mock_redis_client),
            &indexer_config,
            "stream key".to_string(),
        )
        .await
        .unwrap();
    }
}
