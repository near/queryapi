use crate::indexer_types::{IndexerFunction, IndexerQueueMessage};
use crate::opts::{Opts, Parser};
use crate::queue;
use crate::s3;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::Config;
use aws_sdk_sqs::Client;
use aws_types::SdkConfig;
use chrono::{DateTime, LocalResult, TimeZone, Utc};
use indexer_rule_type::indexer_rule::{IndexerRule, MatchingRule};
use indexer_rules_engine::types::indexer_rule_match::{ChainId, IndexerRuleMatchPayload};
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::blocks::RpcBlockRequest;
use near_lake_framework::near_indexer_primitives::types::{BlockHeight, BlockId, BlockReference};
use serde_json::from_str;
use tokio::task::JoinHandle;

pub const INDEXED_DATA_FILES_BUCKET: &str = "near-delta-lake";
pub const LAKE_BUCKET_PREFIX: &str = "near-lake-data-";
pub const INDEXED_DATA_FILES_FOLDER: &str = "silver/contracts/action_receipt_actions/metadata";
pub const MAX_UNINDEXED_BLOCKS_TO_PROCESS: u64 = 7200; // two hours of blocks takes ~14 minutes.

pub fn spawn_historical_message_thread(
    block_height: BlockHeight,
    new_indexer_function: &IndexerFunction,
) -> Option<JoinHandle<i64>> {
    new_indexer_function.start_block_height.map(|_| {
        let new_indexer_function_copy = new_indexer_function.clone();
        tokio::spawn(process_historical_messages(
            block_height,
            new_indexer_function_copy,
        ))
    })
}

pub(crate) async fn process_historical_messages(
    block_height: BlockHeight,
    indexer_function: IndexerFunction,
) -> i64 {
    let start_block = indexer_function.start_block_height.unwrap();
    let block_difference: i64 = (block_height - start_block) as i64;
    match block_difference {
        i64::MIN..=-1 => {
            tracing::error!(target: crate::INDEXER, "Skipping back fill, start_block_height is greater than current block height: {:?} {:?}",
                                     indexer_function.account_id,
                                     indexer_function.function_name);
        }
        0 => {
            tracing::info!(target: crate::INDEXER, "Skipping back fill, start_block_height is equal to current block height: {:?} {:?}",
                                     indexer_function.account_id,
                                     indexer_function.function_name);
        }
        1..=i64::MAX => {
            tracing::info!(
                target: crate::INDEXER,
                "Back filling {block_difference} blocks from {start_block} to current block height {block_height}: {:?} {:?}",
                indexer_function.account_id,
                indexer_function.function_name
            );

            let opts = Opts::parse();

            let chain_id = opts.chain_id().clone();
            let aws_region = opts.aws_queue_region.clone();
            let queue_client = queue::queue_client(aws_region, opts.queue_credentials());
            let queue_url = opts.start_from_block_queue_url.clone();
            let aws_config: &SdkConfig = &opts.lake_aws_sdk_config();

            let json_rpc_client = JsonRpcClient::connect(opts.rpc_url());
            let start_date = block_to_date(start_block, &json_rpc_client).await;
            if start_date.is_none() {
                tracing::error!(
                    target: crate::INDEXER,
                    "Failed to get start date for block {}",
                    start_block
                );
                return block_difference;
            }

            let mut indexer_function = indexer_function.clone();

            let last_indexed_block = last_indexed_block_from_metadata(aws_config).await;
            if last_indexed_block.is_err() {
                tracing::error!(
                    target: crate::INDEXER,
                    last_indexed_block = ?last_indexed_block,
                );
                return block_difference;
            }
            let last_indexed_block = last_indexed_block.unwrap();

            let mut blocks_from_index = filter_matching_blocks_from_index_files(
                start_block,
                &indexer_function.indexer_rule,
                aws_config,
                start_date.unwrap(),
            )
            .await;

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
                    block_height,
                    &indexer_function.indexer_rule,
                    aws_config,
                    chain_id.clone(),
                )
                .await;

            blocks_from_index.append(&mut blocks_between_indexed_and_current_block);

            let first_block_in_data = *blocks_from_index.first().unwrap_or(&start_block);
            for current_block in blocks_from_index {
                send_execution_message(
                    block_height,
                    first_block_in_data,
                    chain_id.clone(),
                    &queue_client,
                    queue_url.clone(),
                    &mut indexer_function,
                    current_block,
                    None,
                )
                .await;
            }
        }
    }
    block_difference
}

pub(crate) async fn last_indexed_block_from_metadata(
    aws_config: &SdkConfig,
) -> anyhow::Result<BlockHeight> {
    let key = format!("{}/{}", INDEXED_DATA_FILES_FOLDER, "latest_block.json");
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);
    let metadata = s3::fetch_text_file_from_s3(INDEXED_DATA_FILES_BUCKET, key, s3_client).await;

    let metadata: serde_json::Value = serde_json::from_str(&metadata).unwrap();
    let last_indexed_block = metadata["last_indexed_block"].clone();
    let last_indexed_block = last_indexed_block.as_str();
    if last_indexed_block.is_none() {
        return Err(anyhow::anyhow!(
            "No last_indexed_block found in latest_block.json"
        ));
    }
    let last_indexed_block = last_indexed_block.unwrap();
    let last_indexed_block = from_str(last_indexed_block);
    if last_indexed_block.is_err() {
        return Err(anyhow::anyhow!(
            "last_indexed_block couldn't be converted to u64"
        ));
    }
    let last_indexed_block = last_indexed_block.unwrap();
    tracing::info!(
        target: crate::INDEXER,
        "Last indexed block from latest_block.json: {:?}",
        last_indexed_block
    );
    Ok(last_indexed_block)
}

pub(crate) async fn filter_matching_blocks_from_index_files(
    start_block_height: BlockHeight,
    indexer_rule: &IndexerRule,
    aws_config: &SdkConfig,
    start_date: DateTime<Utc>,
) -> Vec<BlockHeight> {
    let s3_bucket = INDEXED_DATA_FILES_BUCKET;

    let mut needs_dedupe_and_sort = false;

    let index_files_content = match &indexer_rule.matching_rule {
        MatchingRule::ActionAny {
            affected_account_id,
            status,
        } => {
            if affected_account_id.contains('*') || affected_account_id.contains(',') {
                needs_dedupe_and_sort = true;
            }
            s3::fetch_contract_index_files(
                aws_config,
                s3_bucket,
                INDEXED_DATA_FILES_FOLDER,
                start_date,
                affected_account_id,
            )
            .await
        }
        MatchingRule::ActionFunctionCall {
            affected_account_id,
            status,
            function,
        } => {
            tracing::error!(
                target: crate::INDEXER,
                "ActionFunctionCall matching rule not supported for historical processing"
            );
            return vec![];

            // if affected_account_id.contains('*') || affected_account_id.contains(',) {
            //     needs_dedupe_and_sort = true;
            // }
            // let s3_prefix = format!("{}/{}", INDEXED_DATA_FILES_FOLDER, affected_account_id);
            // fetch_contract_index_files(aws_config, s3_bucket, s3_prefix).await
            // // todo implement, use function name selector
        }
        MatchingRule::Event { .. } => {
            tracing::error!(
                target: crate::INDEXER,
                "Event matching rule not supported for historical processing"
            );
            return vec![];
        }
    };

    tracing::info!(
        target: crate::INDEXER,
        "Found {file_count} index files matching rule {indexer_rule:?}",
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
        "Found {block_count} indexed blocks to process.",
        block_count = blocks_to_process.len()
    );

    blocks_to_process
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
    indexer_rule: &IndexerRule,
    aws_config: &SdkConfig,
    chain_id: ChainId,
) -> Vec<u64> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);
    let lake_bucket = lake_bucket_for_chain(chain_id.clone());

    let count = ending_block_height - last_indexed_block;
    if count > MAX_UNINDEXED_BLOCKS_TO_PROCESS {
        tracing::error!(
            target: crate::INDEXER,
            "Too many unindexed blocks to filter: {count}. Last indexed block is {last_indexed_block}.",
        );
        return vec![];
    }
    tracing::info!(
        target: crate::INDEXER,
        "Filtering {count} unindexed blocks from lake: from block {last_indexed_block} to {ending_block_height}",
    );
    let mut blocks_to_process: Vec<u64> = vec![];
    for current_block in (last_indexed_block + 1)..ending_block_height {
        // fetch block file from S3
        let key = format!("{}/block.json", normalize_block_height(current_block));
        let block = s3::fetch_text_file_from_s3(&lake_bucket, key, s3_client.clone()).await;
        let block_view = serde_json::from_slice::<
            near_lake_framework::near_indexer_primitives::views::BlockView,
        >(block.as_ref());
        let mut shards = vec![];
        match block_view {
            Ok(block_view) => {
                for shard_id in 0..block_view.chunks.len() as u64 {
                    let key = format!(
                        "{}/shard_{}.json",
                        normalize_block_height(current_block),
                        shard_id
                    );
                    let shard =
                        s3::fetch_text_file_from_s3(&lake_bucket, key, s3_client.clone()).await;
                    match serde_json::from_slice::<
                        near_lake_framework::near_indexer_primitives::IndexerShard,
                    >(shard.as_ref())
                    {
                        Ok(parsed_shard) => {
                            shards.push(parsed_shard);
                        }
                        Err(e) => {
                            tracing::error!(
                                target: crate::INDEXER,
                                "Error parsing shard: {}",
                                e.to_string()
                            );
                            // todo this needs better error handling
                        }
                    }
                }
                let streamer_message =
                    near_lake_framework::near_indexer_primitives::StreamerMessage {
                        block: block_view,
                        shards,
                    };

                // // filter block
                let matches = indexer_rules_engine::reduce_indexer_rule_matches_sync(
                    indexer_rule,
                    &streamer_message,
                    chain_id.clone(),
                );
                match matches {
                    Ok(match_list) => {
                        if !match_list.is_empty() {
                            blocks_to_process.push(current_block);
                        }
                    }
                    Err(e) => {
                        tracing::warn!(
                            target: crate::INDEXER,
                            "Error matching block {} against S3 file: {:?}",
                            current_block,
                            e
                        );
                    }
                }
            }
            Err(e) => {
                tracing::error!(
                    target: crate::INDEXER,
                    "Error parsing block {} from S3: {:?}",
                    current_block,
                    e
                );
            }
        }
    }
    tracing::info!(
        target: crate::INDEXER,
        "Found {block_count} unindexed blocks to process.",
        block_count = blocks_to_process.len()
    );
    blocks_to_process
}

fn lake_bucket_for_chain(chain_id: ChainId) -> String {
    format!("{}{}", LAKE_BUCKET_PREFIX, chain_id)
}

fn normalize_block_height(block_height: BlockHeight) -> String {
    format!("{:0>12}", block_height)
}

async fn send_execution_message(
    block_height: BlockHeight,
    first_block: BlockHeight,
    chain_id: ChainId,
    queue_client: &Client,
    queue_url: String,
    indexer_function: &mut IndexerFunction,
    current_block: u64,
    payload: Option<IndexerRuleMatchPayload>,
) {
    // only request provisioning on the first block
    if current_block != first_block {
        indexer_function.provisioned = true;
    }

    let msg = IndexerQueueMessage {
        chain_id,
        indexer_rule_id: 0,
        indexer_rule_name: indexer_function.function_name.clone(),
        payload,
        block_height: current_block,
        indexer_function: indexer_function.clone(),
        is_historical: true,
    };

    match queue::send_to_indexer_queue(queue_client, queue_url, vec![msg]).await {
        Ok(_) => {}
        Err(err) => tracing::error!(
            target: crate::INDEXER,
            "#{} an error occurred when sending messages to the queue\n{:#?}",
            block_height,
            err
        ),
    }
}

pub async fn block_to_date(block_height: u64, client: &JsonRpcClient) -> Option<DateTime<Utc>> {
    let request = RpcBlockRequest {
        block_reference: BlockReference::BlockId(BlockId::Height(block_height)),
    };

    match client.call(request).await {
        Ok(response) => {
            let header = response.header;
            let timestamp_nanosec = header.timestamp_nanosec;
            match Utc.timestamp_opt((timestamp_nanosec / 1000000000) as i64, 0) {
                LocalResult::Single(date) => Some(date),
                LocalResult::Ambiguous(date, _) => Some(date),
                LocalResult::None => {
                    tracing::error!("Unable to get block timestamp");
                    None
                }
            }
        }
        Err(err) => {
            tracing::error!("Unable to get block: {:?}", err);
            None
        }
    }
}
