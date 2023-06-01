use crate::indexer_types::{IndexerFunction, IndexerQueueMessage};
use crate::opts;
use crate::opts::{Opts, Parser};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::Config;
use aws_sdk_sqs::Client;
use aws_types::SdkConfig;
use chrono::{DateTime, LocalResult, NaiveDate, TimeZone, Utc};
use futures::future::join_all;
use indexer_rule_type::indexer_rule::{IndexerRule, MatchingRule};
use indexer_rules_engine::types::indexer_rule_match::{ChainId, IndexerRuleMatchPayload};
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::blocks::RpcBlockRequest;
use near_lake_framework::near_indexer_primitives::types::{BlockHeight, BlockId, BlockReference};
use tokio::task::JoinHandle;

const INDEXED_DATA_FILES_BUCKET: &str = "near-delta-lake";
const LAKE_BUCKET_PREFIX: &str = "near-lake-data-";

pub fn spawn_historical_message_thread(
    block_height: BlockHeight,
    new_indexer_function: &mut IndexerFunction,
) -> Option<JoinHandle<i64>> {
    new_indexer_function.start_block_height.map(|_| {
        let new_indexer_function_copy = new_indexer_function.clone();
        tokio::spawn(process_historical_messages(
            block_height,
            new_indexer_function_copy,
        ))
    })
}

async fn process_historical_messages(
    block_height: BlockHeight,
    indexer_function: IndexerFunction,
) -> i64 {
    let start_block = indexer_function.start_block_height.unwrap();
    let block_difference: i64 = (block_height - start_block) as i64;
    match block_difference {
        i64::MIN..=-1 => {
            tracing::error!(target: crate::INDEXER, "Skipping back fill, start_block_height is greater than current block height: {:?} {:?}",
                                     indexer_function.account_id.clone(),
                                     indexer_function.function_name.clone(),);
        }
        0 => {
            tracing::info!(target: crate::INDEXER, "Skipping back fill, start_block_height is equal to current block height: {:?} {:?}",
                                     indexer_function.account_id.clone(),
                                     indexer_function.function_name.clone(),);
        }
        1..=i64::MAX => {
            tracing::info!(
                target: crate::INDEXER,
                "Back filling {block_difference} blocks from {start_block} to current block height {block_height}: {:?} {:?}",
                indexer_function.account_id.clone(),
                indexer_function.function_name.clone(),
            );

            let opts = Opts::parse();

            let chain_id = opts.chain_id().clone();
            let aws_region = opts.aws_queue_region.clone();
            let queue_client = &opts.queue_client(aws_region);
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

            let (last_indexed_block, mut blocks_from_index) =
                filter_matching_blocks_from_index_files(
                    start_block,
                    block_height,
                    &indexer_function.indexer_rule,
                    aws_config,
                    start_date.unwrap(),
                )
                .await;

            let mut blocks_between_indexed_and_current_block: Vec<BlockHeight> =
                filter_matching_blocks_manually(
                    last_indexed_block,
                    block_height,
                    &indexer_function.indexer_rule,
                    aws_config,
                    chain_id.clone(),
                )
                .await;

            blocks_from_index.append(&mut blocks_between_indexed_and_current_block);

            for current_block in blocks_from_index {
                send_execution_message(
                    block_height,
                    start_block,
                    chain_id.clone(),
                    queue_client,
                    queue_url.clone(),
                    &mut indexer_function,
                    current_block,
                    None, //alert_queue_message.payload.clone(),  // future: populate with data from the Match
                )
                .await;
            }
        }
    }
    block_difference
}

async fn filter_matching_blocks_from_index_files(
    start_block_height: BlockHeight,
    end_block_height: BlockHeight,
    indexer_rule: &IndexerRule,
    aws_config: &SdkConfig,
    start_date: DateTime<Utc>,
) -> (BlockHeight, Vec<BlockHeight>) {
    let s3_bucket = INDEXED_DATA_FILES_BUCKET;

    let index_files_content = match &indexer_rule.matching_rule {
        MatchingRule::ActionAny {
            affected_account_id,
            status,
        } => {
            let s3_prefix = format!("silver/contracts/metadata/{}", affected_account_id);
            fetch_contract_index_files(aws_config, s3_bucket, s3_prefix, start_date).await
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
            return (end_block_height, vec![]);

            // let s3_prefix = format!("silver/contracts/metadata/{}", affected_account_id);
            // fetch_contract_index_files(aws_config, s3_bucket, s3_prefix).await
            // // todo implement, use function name selector
        }
        MatchingRule::Event { .. } => {
            tracing::error!(
                target: crate::INDEXER,
                "Event matching rule not supported for historical processing"
            );
            return (end_block_height, vec![]);
        }
    };

    tracing::info!(
        target: crate::INDEXER,
        "Found {file_count} index files matching rule {indexer_rule:?}",
        file_count = index_files_content.len()
    );

    let blocks_to_process: Vec<BlockHeight> =
        parse_blocks_from_index_files(index_files_content, start_block_height);
    tracing::info!(
        target: crate::INDEXER,
        "Found {block_count} indexed blocks to process.",
        block_count = blocks_to_process.len()
    );

    let last_indexed_block = blocks_to_process.last().unwrap_or(&start_block_height);

    (*last_indexed_block, blocks_to_process)
}

fn parse_blocks_from_index_files(
    index_files_content: Vec<String>,
    start_block_height: u64,
) -> Vec<BlockHeight> {
    index_files_content
        .into_iter()
        .map(|file_content| {
            if let Ok(file_json) = serde_json::from_str::<serde_json::Value>(&file_content) {
                if let Some(block_heights) = file_json["heights"].as_array() {
                    block_heights
                        .into_iter()
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
        .flatten()
        .collect::<Vec<u64>>()
}

async fn filter_matching_blocks_manually(
    last_indexed_block: BlockHeight,
    ending_block_height: BlockHeight,
    indexer_rule: &IndexerRule,
    aws_config: &SdkConfig,
    chain_id: ChainId,
) -> Vec<u64> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);
    let lake_bucket = lake_bucket_for_chain(chain_id.clone());

    let mut blocks_to_process: Vec<u64> = vec![];
    for current_block in (last_indexed_block + 1)..ending_block_height {
        // fetch block file from S3
        let key = format!("{}/block.json", normalize_block_height(current_block));
        let block = fetch_text_file_from_s3(&lake_bucket, key, s3_client.clone()).await;
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
                    let shard = fetch_text_file_from_s3(&lake_bucket, key, s3_client.clone()).await;
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
                    &indexer_rule,
                    &streamer_message,
                    chain_id.clone(),
                );
                match matches {
                    Ok(match_list) => {
                        if match_list.len() > 0 {
                            blocks_to_process.push(current_block);
                            tracing::info!(
                                target: crate::INDEXER,
                                "Matched historical block {} against S3 file",
                                current_block,
                            );
                        }
                    }
                    Err(e) => {}
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
    blocks_to_process
}

fn lake_bucket_for_chain(chain_id: ChainId) -> String {
    format!("{}{}", LAKE_BUCKET_PREFIX, chain_id)
}

fn normalize_block_height(block_height: BlockHeight) -> String {
    format!("{:0>12}", block_height)
}

async fn fetch_contract_index_files(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_prefix: String,
    start_date: DateTime<Utc>,
) -> Vec<String> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);

    match s3_client
        .list_objects_v2()
        .bucket(s3_bucket)
        .prefix(s3_prefix)
        .send()
        .await
    {
        Ok(file_list) => {
            if let Some(objects) = file_list.contents {
                let fetch_and_parse_tasks = objects
                    .into_iter()
                    .filter(|index_file_listing| {
                        file_name_date_after(start_date, index_file_listing.key.clone().unwrap())
                    })
                    .map(|index_file_listing| {
                        let key = index_file_listing.key.clone().unwrap();

                        let s3_client = s3_client.clone();
                        async move {
                            // Fetch the file
                            fetch_text_file_from_s3(s3_bucket, key, s3_client).await
                        }
                    })
                    .collect::<Vec<_>>();

                // Execute all tasks in parallel and wait for completion
                let file_contents: Vec<String> = join_all(fetch_and_parse_tasks).await;
                file_contents
                    .into_iter()
                    .filter(|file_contents| file_contents.len() > 0)
                    .collect::<Vec<String>>()
            } else {
                tracing::error!(
                    target: crate::INDEXER,
                    "Error listing files in S3 bucket, no files found."
                );
                vec![]
            }
        }
        Err(e) => {
            tracing::error!(
                target: crate::INDEXER,
                "Error listing files in S3 bucket: {:?}",
                e
            );
            vec![]
        }
    }
}

fn file_name_date_after(start_date: DateTime<Utc>, file_name: String) -> bool {
    // check whether the filename is a date after the start date
    // filename is in format 2022-10-03.json
    let file_name_date = file_name.split("/").last().unwrap().replace(".json", "");
    let file_name_date = NaiveDate::parse_from_str(&file_name_date, "%Y-%m-%d");
    match file_name_date {
        Ok(file_name_date) => {
            if file_name_date >= start_date.date_naive() {
                true
            } else {
                false
            }
        }
        Err(e) => {
            tracing::error!(
                target: crate::INDEXER,
                "Error parsing file name date: {:?}",
                e
            );
            false
        }
    }
}

async fn fetch_text_file_from_s3(s3_bucket: &str, key: String, s3_client: S3Client) -> String {
    let get_object_output = s3_client
        .get_object()
        .bucket(s3_bucket)
        .key(key.clone())
        .send()
        .await;

    match get_object_output {
        Ok(object_output) => {
            let bytes = object_output.body.collect().await;
            match bytes {
                Ok(bytes) => {
                    let file_contents = String::from_utf8(bytes.to_vec());
                    match file_contents {
                        Ok(file_contents) => {
                            tracing::debug!(
                                target: crate::INDEXER,
                                "Fetched S3 file {}",
                                key.clone(),
                            );
                            file_contents
                        }
                        Err(e) => {
                            tracing::error!(
                                target: crate::INDEXER,
                                "Error parsing index file: {:?}",
                                e
                            );
                            "".to_string()
                        }
                    }
                }
                Err(e) => {
                    tracing::error!(target: crate::INDEXER, "Error fetching index file: {:?}", e);
                    "".to_string()
                }
            }
        }
        Err(e) => {
            tracing::error!(target: crate::INDEXER, "Error fetching index file: {:?}", e);
            "".to_string()
        }
    }
}

async fn send_execution_message(
    block_height: BlockHeight,
    start_block: u64,
    chain_id: ChainId,
    queue_client: &Client,
    queue_url: String,
    indexer_function: &mut IndexerFunction,
    current_block: u64,
    payload: Option<IndexerRuleMatchPayload>,
) {
    // only request provisioning on the first block
    if current_block != start_block {
        indexer_function.provisioned = true;
    }

    let msg = IndexerQueueMessage {
        chain_id,
        indexer_rule_id: 0,
        indexer_rule_name: indexer_function.function_name.clone(),
        payload,
        block_height: current_block,
        indexer_function: indexer_function.clone(),
    };

    match opts::send_to_indexer_queue(queue_client, queue_url, vec![msg]).await {
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

// #[tokio::test]
// async fn test_process_historical_messages() {
//     let indexer_function = IndexerFunction {
//         account_id: "buildnear.testnet".to_string().parse().unwrap(),
//         function_name: "index_stuff".to_string(),
//         code: "".to_string(),
//         start_block_height: Some(85376002),
//         schema: None,
//         provisioned: false,
//         indexer_rule: indexer_rule_type::near_social_indexer_rule(),
//     };
//
//     // this depends on Opts now
//     process_historical_messages(85376003, indexer_function, need_a_mock_rpc_client).await;
// }
