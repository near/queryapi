use crate::indexer_types::IndexerFunction;
use crate::s3;
use anyhow::{bail, Context};
use aws_sdk_s3::Client as S3Client;
use chrono::{DateTime, LocalResult, TimeZone, Utc};
use indexer_rule_type::indexer_rule::MatchingRule;
use indexer_rules_engine::types::indexer_rule_match::ChainId;
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::blocks::RpcBlockRequest;
use near_lake_framework::near_indexer_primitives::types::{BlockHeight, BlockId, BlockReference};
use serde_json::from_str;
use tokio::task::JoinHandle;

pub const INDEXED_DATA_FILES_BUCKET: &str = "near-delta-lake";
pub const LAKE_BUCKET_PREFIX: &str = "near-lake-data-";
pub const INDEXED_ACTIONS_FILES_FOLDER: &str = "silver/accounts/action_receipt_actions/metadata";
pub const MAX_UNINDEXED_BLOCKS_TO_PROCESS: u64 = 7200; // two hours of blocks takes ~14 minutes.
pub const MAX_RPC_BLOCKS_TO_PROCESS: u8 = 20;

pub struct Task {
    handle: JoinHandle<()>,
    cancellation_token: tokio_util::sync::CancellationToken,
}

/// Represents the async task used to process and push historical messages
pub struct Streamer {
    task: Option<Task>,
}

impl Streamer {
    pub fn new() -> Self {
        Streamer { task: None }
    }

    pub fn start(
        &mut self,
        current_block_height: BlockHeight,
        indexer: IndexerFunction,
        redis_connection_manager: storage::ConnectionManager,
        s3_client: S3Client,
        chain_id: ChainId,
        json_rpc_client: JsonRpcClient,
    ) -> anyhow::Result<()> {
        if self.task.is_some() {
            return Err(anyhow::anyhow!("Streamer has already been started",));
        }

        let cancellation_token = tokio_util::sync::CancellationToken::new();
        let cancellation_token_clone = cancellation_token.clone();

        let handle = tokio::spawn(async move {
            tokio::select! {
                _ = cancellation_token_clone.cancelled() => {
                    tracing::info!(
                        target: crate::INDEXER,
                        "Cancelling existing historical backfill for indexer: {:?}",
                        indexer.get_full_name(),
                    );
                },
                _ = process_historical_messages_or_handle_error(
                    current_block_height,
                    indexer.clone(),
                    &redis_connection_manager,
                    &s3_client,
                    &chain_id,
                    &json_rpc_client,
                ) => {
                    tracing::info!(
                        target: crate::INDEXER,
                        "Finished historical backfill for indexer: {:?}",
                        indexer.get_full_name(),
                    );
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
            task.handle.await?;

            return Ok(());
        }

        Err(anyhow::anyhow!(
            "Attempted to cancel already cancelled, or not started, Streamer"
        ))
    }
}

pub(crate) async fn process_historical_messages_or_handle_error(
    current_block_height: BlockHeight,
    indexer_function: IndexerFunction,
    redis_connection_manager: &storage::ConnectionManager,
    s3_client: &S3Client,
    chain_id: &ChainId,
    json_rpc_client: &JsonRpcClient,
) -> i64 {
    match process_historical_messages(
        current_block_height,
        indexer_function,
        redis_connection_manager,
        s3_client,
        chain_id,
        json_rpc_client,
    )
    .await
    {
        Ok(block_difference) => block_difference,
        Err(err) => {
            // todo: when Coordinator can send log messages to Runner, send this error to Runner
            tracing::error!(
                target: crate::INDEXER,
                "Error processing historical messages: {:?}",
                err
            );
            0
        }
    }
}
pub(crate) async fn process_historical_messages(
    current_block_height: BlockHeight,
    indexer_function: IndexerFunction,
    redis_connection_manager: &storage::ConnectionManager,
    s3_client: &S3Client,
    chain_id: &ChainId,
    json_rpc_client: &JsonRpcClient,
) -> anyhow::Result<i64> {
    let start_block = indexer_function.start_block_height.unwrap();
    let block_difference: i64 = (current_block_height - start_block) as i64;
    match block_difference {
        i64::MIN..=-1 => {
            bail!("Skipping back fill, start_block_height is greater than current block height: {:?} {:?}",
                                     indexer_function.account_id,
                                     indexer_function.function_name);
        }
        0 => {
            bail!("Skipping back fill, start_block_height is equal to current block height: {:?} {:?}",
                                     indexer_function.account_id,
                                     indexer_function.function_name);
        }
        1..=i64::MAX => {
            tracing::info!(
                target: crate::INDEXER,
                "Back filling {block_difference} blocks from {start_block} to current block height {current_block_height}: {:?} {:?}",
                indexer_function.account_id,
                indexer_function.function_name
            );

            let start_date =
                lookup_block_date_or_next_block_date(start_block, json_rpc_client).await?;

            let last_indexed_block = last_indexed_block_from_metadata(s3_client).await?;

            let mut blocks_from_index = filter_matching_blocks_from_index_files(
                start_block,
                &indexer_function,
                s3_client,
                start_date,
            )
            .await?;

            // Check for the case where an index file is written right after we get the last_indexed_block metadata
            let last_block_in_data = blocks_from_index.last().unwrap_or(&start_block);
            let last_indexed_block = if last_block_in_data > &last_indexed_block {
                *last_block_in_data
            } else {
                last_indexed_block
            };

            let mut blocks_between_indexed_and_current_block: Vec<BlockHeight> =
                filter_matching_unindexed_blocks_from_lake(
                    last_indexed_block,
                    current_block_height,
                    &indexer_function,
                    s3_client,
                    chain_id,
                )
                .await?;

            blocks_from_index.append(&mut blocks_between_indexed_and_current_block);

            if !blocks_from_index.is_empty() {
                storage::del(
                    redis_connection_manager,
                    storage::generate_historical_stream_key(&indexer_function.get_full_name()),
                )
                .await?;
                storage::sadd(
                    redis_connection_manager,
                    storage::STREAMS_SET_KEY,
                    storage::generate_historical_stream_key(&indexer_function.get_full_name()),
                )
                .await?;
                storage::set(
                    redis_connection_manager,
                    storage::generate_historical_storage_key(&indexer_function.get_full_name()),
                    serde_json::to_string(&indexer_function)?,
                    None,
                )
                .await?;
            }

            for current_block in blocks_from_index {
                storage::xadd(
                    redis_connection_manager,
                    storage::generate_historical_stream_key(&indexer_function.get_full_name()),
                    &[("block_height", current_block)],
                )
                .await?;
            }
        }
    }
    Ok(block_difference)
}

pub(crate) async fn last_indexed_block_from_metadata(
    s3_client: &S3Client,
) -> anyhow::Result<BlockHeight> {
    let key = format!("{}/{}", INDEXED_ACTIONS_FILES_FOLDER, "latest_block.json");
    let metadata = s3::fetch_text_file_from_s3(INDEXED_DATA_FILES_BUCKET, key, s3_client).await?;

    let metadata: serde_json::Value = serde_json::from_str(&metadata).unwrap();
    let last_indexed_block = metadata["last_indexed_block"].clone();
    let last_indexed_block = last_indexed_block
        .as_str()
        .context("No last_indexed_block found in latest_block.json")?;
    let last_indexed_block =
        from_str(last_indexed_block).context("last_indexed_block couldn't be converted to u64")?;
    tracing::info!(
        target: crate::INDEXER,
        "Last indexed block from latest_block.json: {:?}",
        last_indexed_block
    );
    Ok(last_indexed_block)
}

pub(crate) async fn filter_matching_blocks_from_index_files(
    start_block_height: BlockHeight,
    indexer_function: &IndexerFunction,
    s3_client: &S3Client,
    start_date: DateTime<Utc>,
) -> anyhow::Result<Vec<BlockHeight>> {
    let s3_bucket = INDEXED_DATA_FILES_BUCKET;

    let mut needs_dedupe_and_sort = false;
    let indexer_rule = &indexer_function.indexer_rule;

    let index_files_content = match &indexer_rule.matching_rule {
        MatchingRule::ActionAny {
            affected_account_id,
            ..
        } => {
            if affected_account_id.contains('*') || affected_account_id.contains(',') {
                needs_dedupe_and_sort = true;
            }
            s3::fetch_contract_index_files(
                s3_client,
                s3_bucket,
                INDEXED_ACTIONS_FILES_FOLDER,
                start_date,
                affected_account_id,
            )
            .await
        }
        MatchingRule::ActionFunctionCall { .. } => {
            bail!("ActionFunctionCall matching rule not yet supported for historical processing, function: {:?} {:?}", indexer_function.account_id, indexer_function.function_name);
        }
        MatchingRule::Event { .. } => {
            bail!("Event matching rule not yet supported for historical processing, function {:?} {:?}", indexer_function.account_id, indexer_function.function_name);
        }
    }?;

    tracing::info!(
        target: crate::INDEXER,
        "Found {file_count} index files for function {:?} {:?} with matching rule {indexer_rule:?}",
        indexer_function.account_id,
        indexer_function.function_name,
        file_count = index_files_content.len()
    );
    let mut blocks_to_process: Vec<BlockHeight> =
        parse_blocks_from_index_files(index_files_content, start_block_height);
    if needs_dedupe_and_sort {
        blocks_to_process.sort();
        blocks_to_process.dedup();
    }
    tracing::info!(
        target: crate::INDEXER,
        "Found {block_count} indexed blocks to process for function {:?} {:?}",
        indexer_function.account_id,
        indexer_function.function_name,
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
                        target: crate::INDEXER,
                        "Unable to parse index file, no heights found: {:?}",
                        file_content
                    );
                    vec![]
                }
            } else {
                tracing::error!(
                    target: crate::INDEXER,
                    "Unable to parse index file: {:?}",
                    file_content
                );
                vec![]
            }
        })
        .collect::<Vec<u64>>()
}

async fn filter_matching_unindexed_blocks_from_lake(
    last_indexed_block: BlockHeight,
    ending_block_height: BlockHeight,
    indexer_function: &IndexerFunction,
    s3_client: &S3Client,
    chain_id: &ChainId,
) -> anyhow::Result<Vec<u64>> {
    let lake_bucket = lake_bucket_for_chain(chain_id);

    let indexer_rule = &indexer_function.indexer_rule;
    let count = ending_block_height - last_indexed_block;
    if count > MAX_UNINDEXED_BLOCKS_TO_PROCESS {
        bail!(
            "Too many unindexed blocks to filter: {count}. Last indexed block is {last_indexed_block} for function {:?} {:?}",
            indexer_function.account_id,
            indexer_function.function_name,
        );
    }
    tracing::info!(
        target: crate::INDEXER,
        "Filtering {count} unindexed blocks from lake: from block {last_indexed_block} to {ending_block_height} for function {:?} {:?}",
        indexer_function.account_id,
        indexer_function.function_name,
    );

    let mut blocks_to_process: Vec<u64> = vec![];
    for current_block in (last_indexed_block + 1)..ending_block_height {
        // fetch block file from S3
        let key = format!("{}/block.json", normalize_block_height(current_block));
        let s3_result = s3::fetch_text_file_from_s3(&lake_bucket, key, s3_client).await;

        if s3_result.is_err() {
            let error = s3_result.err().unwrap();
            if error
                .root_cause()
                .downcast_ref::<aws_sdk_s3::error::NoSuchKey>()
                .is_some()
            {
                tracing::info!(
                    target: crate::INDEXER,
                    "In manual filtering, skipping block number {} which was not found. For function {:?} {:?}",
                    current_block,
                    indexer_function.account_id,
                    indexer_function.function_name,
                );
                continue;
            } else {
                bail!(error);
            }
        }

        let block = s3_result.unwrap();
        let block_view = serde_json::from_slice::<
            near_lake_framework::near_indexer_primitives::views::BlockView,
        >(block.as_ref())
        .with_context(|| format!("Error parsing block {} from S3", current_block))?;

        let mut shards = vec![];
        for shard_id in 0..block_view.chunks.len() as u64 {
            let key = format!(
                "{}/shard_{}.json",
                normalize_block_height(current_block),
                shard_id
            );
            let shard = s3::fetch_text_file_from_s3(&lake_bucket, key, s3_client).await?;
            match serde_json::from_slice::<near_lake_framework::near_indexer_primitives::IndexerShard>(
                shard.as_ref(),
            ) {
                Ok(parsed_shard) => {
                    shards.push(parsed_shard);
                }
                Err(e) => {
                    bail!("Error parsing shard: {}", e.to_string());
                }
            }
        }

        let streamer_message = near_lake_framework::near_indexer_primitives::StreamerMessage {
            block: block_view,
            shards,
        };

        // filter block
        let matches = indexer_rules_engine::reduce_indexer_rule_matches_sync(
            indexer_rule,
            &streamer_message,
            chain_id.clone(),
        );
        if !matches.is_empty() {
            blocks_to_process.push(current_block);
        }
    }

    tracing::info!(
        target: crate::INDEXER,
        "Found {block_count} unindexed blocks to process for function {:?} {:?}",
        indexer_function.account_id,
        indexer_function.function_name,
        block_count = blocks_to_process.len()
    );
    Ok(blocks_to_process)
}

fn lake_bucket_for_chain(chain_id: &ChainId) -> String {
    format!("{}{}", LAKE_BUCKET_PREFIX, chain_id)
}

fn normalize_block_height(block_height: BlockHeight) -> String {
    format!("{:0>12}", block_height)
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
