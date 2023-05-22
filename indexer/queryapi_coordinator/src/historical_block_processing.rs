use crate::indexer_types::{IndexerFunction, IndexerQueueMessage};
use crate::opts;
use crate::opts::{Opts, Parser};

const INDEXED_DATA_FILES_BUCKET: &'static str = "near-delta-lake";

pub fn spawn_historical_message_thread(
    block_height: BlockHeight,
    new_indexer_function: &mut IndexerFunction,
) -> Option<JoinHandle<i64>> {
    new_indexer_function.start_block_height.map(|_| {
        let new_indexer_function_copy = new_indexer_function.clone();
        tokio::spawn(async move {
            process_historical_messages(block_height, new_indexer_function_copy).await
        })
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

            for current_block in start_block..block_height {
                let mut indexer_function = indexer_function.clone();

                // only request provisioning on the first block
                if current_block != start_block {
                    indexer_function.provisioned = true;
                }

                let msg = IndexerQueueMessage {
                    chain_id: chain_id.clone(),
                    indexer_rule_id: 0,
                    indexer_rule_name: indexer_function.function_name.clone(),
                    payload: None, //alert_queue_message.payload.clone(),  // todo populate with data from the Match
                    block_height: current_block,
                    indexer_function: indexer_function.clone(),
                };

                match opts::send_to_indexer_queue(queue_client, queue_url.clone(), vec![msg]).await
                {
                    Ok(_) => {}
                    Err(err) => tracing::error!(
                        target: crate::INDEXER,
                        "#{} an error occurred during sending messages to the queue\n{:#?}",
                        block_height,
                        err
                    ),
                }
            }
        }
    }
    block_difference
}

#[tokio::test]
async fn test_process_historical_messages() {
    let indexer_function = IndexerFunction {
        account_id: "buildnear.testnet".to_string().parse().unwrap(),
        function_name: "index_stuff".to_string(),
        code: "".to_string(),
        start_block_height: Some(85376002),
        schema: None,
        provisioned: false,
        indexer_rule: indexer_rule_type::near_social_indexer_rule(),
    };

    process_historical_messages(85376003, indexer_function).await;
}
