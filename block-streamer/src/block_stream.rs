use anyhow::{bail, Context};
use near_lake_framework::near_indexer_primitives;
use tokio::task::JoinHandle;

use crate::indexer_config::IndexerConfig;
use crate::rules::types::ChainId;
use registry_types::MatchingRule;

/// The number of blocks to prefetch within `near-lake-framework`. The internal default is 100, but
/// we need this configurable for testing purposes.
const LAKE_PREFETCH_SIZE: usize = 100;

pub struct Task {
    handle: JoinHandle<anyhow::Result<()>>,
    cancellation_token: tokio_util::sync::CancellationToken,
}

pub struct BlockStream {
    task: Option<Task>,
    pub indexer_config: IndexerConfig,
    pub chain_id: ChainId,
}

impl BlockStream {
    pub fn new(indexer_config: IndexerConfig, chain_id: ChainId) -> Self {
        Self {
            task: None,
            indexer_config,
            chain_id,
        }
    }

    pub fn start(
        &mut self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        redis_client: std::sync::Arc<crate::redis::RedisClient>,
        delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
        lake_s3_config: aws_sdk_s3::Config,
    ) -> anyhow::Result<()> {
        if self.task.is_some() {
            return Err(anyhow::anyhow!("BlockStreamer has already been started",));
        }

        let cancellation_token = tokio_util::sync::CancellationToken::new();
        let cancellation_token_clone = cancellation_token.clone();

        let indexer_config = self.indexer_config.clone();
        let chain_id = self.chain_id.clone();

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
                    delta_lake_client,
                    lake_s3_config,
                    &chain_id,
                    LAKE_PREFETCH_SIZE
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

pub(crate) async fn start_block_stream(
    start_block_height: near_indexer_primitives::types::BlockHeight,
    indexer: &IndexerConfig,
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
    lake_s3_config: aws_sdk_s3::Config,
    chain_id: &ChainId,
    lake_prefetch_size: usize,
) -> anyhow::Result<()> {
    tracing::info!(
        account_id = indexer.account_id.as_str(),
        function_name = indexer.function_name,
        start_block_height,
        "Starting block stream",
    );

    let latest_block_metadata = delta_lake_client.get_latest_block_metadata().await?;
    let last_indexed_block = latest_block_metadata
        .last_indexed_block
        .parse::<near_indexer_primitives::types::BlockHeight>()?;

    let blocks_from_index = match &indexer.indexer_rule.matching_rule {
        MatchingRule::ActionAny {
            affected_account_id,
            ..
        } => {
            tracing::debug!(
                account_id = indexer.account_id.as_str(),
                function_name = indexer.function_name,
                "Fetching block heights starting from {} from delta lake",
                start_block_height,
            );

            delta_lake_client
                .list_matching_block_heights(start_block_height, affected_account_id)
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
        account_id = indexer.account_id.as_str(),
        function_name = indexer.function_name,
        "Flushing {} block heights from index files to historical Stream",
        blocks_from_index.len(),
    );

    for block in &blocks_from_index {
        redis_client
            .xadd(
                crate::redis::generate_historical_stream_key(&indexer.get_full_name()),
                &[("block_height".to_string(), block.to_owned())],
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
        account_id = indexer.account_id.as_str(),
        function_name = indexer.function_name,
        "Starting near-lake-framework from {last_indexed_block} for indexer",
    );

    let lake_config = match &chain_id {
        ChainId::Mainnet => near_lake_framework::LakeConfigBuilder::default().mainnet(),
        ChainId::Testnet => near_lake_framework::LakeConfigBuilder::default().testnet(),
    }
    .s3_config(lake_s3_config)
    .start_block_height(last_indexed_block)
    .blocks_preload_pool_size(lake_prefetch_size)
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
            redis_client
                .xadd(
                    crate::redis::generate_historical_stream_key(&indexer.get_full_name()),
                    &[("block_height".to_string(), block_height.to_owned())],
                )
                .await
                .context("Failed to add block to Redis Stream")?;
        }
    }

    drop(sender);

    tracing::debug!(
        account_id = indexer.account_id.as_str(),
        function_name = indexer.function_name,
        "Stopped block stream at {}",
        last_indexed_block,
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn adds_matching_blocks_from_index_and_lake() {
        let expected_matching_block_height_count = 3;

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

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client
            .expect_xadd::<String, u64>()
            .returning(|_, _| Ok(()))
            .times(expected_matching_block_height_count);

        let indexer_config = crate::indexer_config::IndexerConfig {
            account_id: near_indexer_primitives::types::AccountId::try_from(
                "morgs.near".to_string(),
            )
            .unwrap(),
            function_name: "test".to_string(),
            indexer_rule: registry_types::IndexerRule {
                indexer_rule_kind: registry_types::IndexerRuleKind::Action,
                matching_rule: registry_types::MatchingRule::ActionAny {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: registry_types::Status::Success,
                },
                name: None,
                id: None,
            },
        };

        let lake_s3_config = crate::test_utils::create_mock_lake_s3_config(&[107503704, 107503705]);

        start_block_stream(
            91940840,
            &indexer_config,
            std::sync::Arc::new(mock_redis_client),
            std::sync::Arc::new(mock_delta_lake_client),
            lake_s3_config,
            &ChainId::Mainnet,
            1,
        )
        .await
        .unwrap();
    }
}
