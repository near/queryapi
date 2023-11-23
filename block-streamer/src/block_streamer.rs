use crate::indexer_config::IndexerConfig;
use crate::rules::types::indexer_rule_match::ChainId;
use crate::rules::MatchingRule;
use crate::s3;
use anyhow::{bail, Context};
use aws_sdk_s3::Client as S3Client;
use chrono::{DateTime, LocalResult, TimeZone, Utc};
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::blocks::RpcBlockRequest;
use near_lake_framework::near_indexer_primitives::types::{BlockHeight, BlockId, BlockReference};
use tokio::task::JoinHandle;

pub const MAX_RPC_BLOCKS_TO_PROCESS: u8 = 20;

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
        start_block_height: BlockHeight,
        indexer: IndexerConfig,
        redis_connection_manager: crate::redis::ConnectionManager,
        s3_client: S3Client,
        chain_id: ChainId,
        json_rpc_client: JsonRpcClient,
        delta_lake_client: crate::delta_lake_client::DeltaLakeClient<crate::s3_client::S3Client>,
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
                    &s3_client,
                    &chain_id,
                    &json_rpc_client,
                    &delta_lake_client,
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
    start_block_height: BlockHeight,
    indexer: IndexerConfig,
    redis_connection_manager: &crate::redis::ConnectionManager,
    s3_client: &S3Client,
    chain_id: &ChainId,
    json_rpc_client: &JsonRpcClient,
    delta_lake_client: &crate::delta_lake_client::DeltaLakeClient<crate::s3_client::S3Client>,
) -> anyhow::Result<()> {
    tracing::info!(
        "Starting block stream from {start_block_height} for indexer: {}",
        indexer.get_full_name(),
    );

    let start_date =
        lookup_block_date_or_next_block_date(start_block_height, json_rpc_client).await?;

    let latest_block_metadata = delta_lake_client.get_latest_block_metadata().await?;
    let last_indexed_block = latest_block_metadata.last_indexed_block.parse::<u64>()?;

    let blocks_from_index = filter_matching_blocks_from_index_files(
        start_block_height,
        &indexer,
        delta_lake_client,
        start_date,
    )
    .await?;

    tracing::info!(
        "Flushing {} block heights from index files to historical Stream for indexer: {}",
        blocks_from_index.len(),
        indexer.get_full_name(),
    );

    for block in &blocks_from_index {
        crate::redis::xadd(
            redis_connection_manager,
            crate::redis::generate_historical_stream_key(&indexer.get_full_name()),
            &[("block_height", block)],
        )
        .await
        .context("Failed to add block to Redis Stream")?;
    }

    let last_indexed_block =
        blocks_from_index
            .last()
            .map_or(last_indexed_block, |&last_block_in_index| {
                // Check for the case where index files are written right after we fetch the last_indexed_block metadata
                std::cmp::max(last_block_in_index, last_indexed_block)
            });

    tracing::info!(
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

    let mut filtered_block_count = 0;
    while let Some(streamer_message) = stream.recv().await {
        let block_height = streamer_message.block.header.height;

        let matches = crate::rules::reduce_indexer_rule_matches(
            &indexer.indexer_rule,
            &streamer_message,
            chain_id.clone(),
        );

        if !matches.is_empty() {
            filtered_block_count += 1;

            crate::redis::xadd(
                redis_connection_manager,
                crate::redis::generate_historical_stream_key(&indexer.get_full_name()),
                &[("block_height", block_height)],
            )
            .await?;
        }
    }

    drop(sender);

    tracing::info!(
        "Flushed {} unindexed block heights to historical Stream for indexer: {}",
        filtered_block_count,
        indexer.get_full_name(),
    );

    Ok(())
}

pub(crate) async fn filter_matching_blocks_from_index_files(
    start_block_height: BlockHeight,
    indexer: &IndexerConfig,
    delta_lake_client: &crate::delta_lake_client::DeltaLakeClient<crate::s3_client::S3Client>,
    start_date: DateTime<Utc>,
) -> anyhow::Result<Vec<BlockHeight>> {
    let mut needs_dedupe_and_sort = false;
    let indexer_rule = &indexer.indexer_rule;

    let index_files_content = match &indexer_rule.matching_rule {
        MatchingRule::ActionAny {
            affected_account_id,
            ..
        } => {
            if affected_account_id.contains('*') || affected_account_id.contains(',') {
                needs_dedupe_and_sort = true;
            }
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

    tracing::info!(
        "Found {file_count} index files for function {:?} {:?} with matching rule {indexer_rule:?}",
        indexer.account_id,
        indexer.function_name,
        file_count = index_files_content.len()
    );
    let mut blocks_to_process: Vec<BlockHeight> =
        parse_blocks_from_index_files(index_files_content, start_block_height);
    if needs_dedupe_and_sort {
        blocks_to_process.sort();
        blocks_to_process.dedup();
    }
    tracing::info!(
        "Found {block_count} indexed blocks to process for function {:?} {:?}",
        indexer.account_id,
        indexer.function_name,
        block_count = blocks_to_process.len()
    );

    Ok(blocks_to_process)
}

fn parse_blocks_from_index_files(
    index_files_content: Vec<String>,
    start_block_height: u64,
) -> Vec<BlockHeight> {
    index_files_content
        .into_iter()
        .flat_map(|file_content| {
            if let Ok(file_json) = serde_json::from_str::<serde_json::Value>(&file_content) {
                if let Some(block_heights) = file_json["heights"].as_array() {
                    block_heights
                        .iter()
                        .map(|block_height| block_height.as_u64().unwrap())
                        .collect::<Vec<u64>>()
                        .into_iter()
                        .filter(|block_height| block_height >= &start_block_height)
                        .collect()
                } else {
                    tracing::error!(
                        "Unable to parse index file, no heights found: {:?}",
                        file_content
                    );
                    vec![]
                }
            } else {
                tracing::error!("Unable to parse index file: {:?}", file_content);
                vec![]
            }
        })
        .collect::<Vec<u64>>()
}

// if block does not exist, try next block, up to MAX_RPC_BLOCKS_TO_PROCESS (20) blocks
pub async fn lookup_block_date_or_next_block_date(
    block_height: u64,
    client: &JsonRpcClient,
) -> anyhow::Result<DateTime<Utc>> {
    let mut current_block_height = block_height;
    let mut retry_count = 0;
    loop {
        let request = RpcBlockRequest {
            block_reference: BlockReference::BlockId(BlockId::Height(current_block_height)),
        };

        match client.call(request).await {
            Ok(response) => {
                let header = response.header;
                let timestamp_nanosec = header.timestamp_nanosec;
                return match Utc.timestamp_opt((timestamp_nanosec / 1000000000) as i64, 0) {
                    LocalResult::Single(date) => Ok(date),
                    LocalResult::Ambiguous(date, _) => Ok(date),
                    LocalResult::None => Err(anyhow::anyhow!("Unable to get block timestamp")),
                };
            }
            Err(_) => {
                tracing::debug!("RPC failed to get block: {:?}", current_block_height);
                retry_count += 1;
                if retry_count > MAX_RPC_BLOCKS_TO_PROCESS {
                    return Err(anyhow::anyhow!("Unable to get block"));
                }
                current_block_height += 1;
            }
        }
    }
}
