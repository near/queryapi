use aws_smithy_runtime::client::http::test_util::{ReplayEvent, StaticReplayClient};
use aws_smithy_types::body::SdkBody;
use near_lake_framework::near_indexer_primitives;

fn generate_replay_events_for_block(block_height: u64) -> Vec<ReplayEvent> {
    vec![
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri(format!("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/?list-type=2&prefix={block_height:0>12}"))
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::from(std::fs::read_to_string(format!("{}/data/{block_height:0>12}/list_objects.xml", env!("CARGO_MANIFEST_DIR"))).unwrap()))
                .unwrap(),
        ),
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri(format!("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/{block_height:0>12}/block.json"))
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::from(std::fs::read_to_string(format!("{}/data/{block_height:0>12}/block.json", env!("CARGO_MANIFEST_DIR"))).unwrap()))
                .unwrap(),
        ),
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri(format!("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/{block_height:0>12}/shard_0.json"))
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::from(std::fs::read_to_string(format!("{}/data/{block_height:0>12}/shard_0.json", env!("CARGO_MANIFEST_DIR"))).unwrap()))
                .unwrap(),
        ),
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri(format!("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/{block_height:0>12}/shard_1.json"))
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::from(std::fs::read_to_string(format!("{}/data/{block_height:0>12}/shard_1.json", env!("CARGO_MANIFEST_DIR"))).unwrap()))
                .unwrap(),
        ),
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri(format!("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/{block_height:0>12}/shard_2.json"))
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::from(std::fs::read_to_string(format!("{}/data/{block_height:0>12}/shard_2.json", env!("CARGO_MANIFEST_DIR"))).unwrap()))
                .unwrap(),
        ),
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri(format!("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/{block_height:0>12}/shard_3.json"))
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::from(std::fs::read_to_string(format!("{}/data/{block_height:0>12}/shard_3.json", env!("CARGO_MANIFEST_DIR"))).unwrap()))
                .unwrap(),
        )
    ]
}

/// Responds with an invalid block - forcing `near_lake_framework` to exit
fn generate_stop_replay_event_for_block(block_height: u64) -> Vec<ReplayEvent> {
    vec![
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri(format!("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/?list-type=2&prefix={block_height:0>12}"))
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::from(std::fs::read_to_string(format!("{}/data/invalid/list_objects.xml", env!("CARGO_MANIFEST_DIR"))).unwrap()))
                .unwrap()
        ),
        ReplayEvent::new(
            http::Request::builder()
                .method("GET")
                .uri("https://near-lake-data-mainnet.s3.eu-central-1.amazonaws.com/invalid/block.json")
                .body(SdkBody::empty())
                .unwrap(),
            http::Response::builder()
                .status(200)
                .body(SdkBody::empty())
                .unwrap(),
        ),
    ]
}

fn generate_replay_events_for_blocks(block_heights: &[u64]) -> Vec<ReplayEvent> {
    let mut events = Vec::new();
    for block_height in block_heights {
        events.extend(generate_replay_events_for_block(*block_height));
    }
    events.extend(generate_stop_replay_event_for_block(
        *block_heights.last().unwrap() + 1,
    ));
    events
}

/// Creates `S3Config` with a mock HTTP client that simulates responses from S3. `block_heights`
/// will be read from the top-level `data/` directory. `near_lake_framework` verifies the order of
/// blocks, therefore passed `block_heights` _must_ be in the order which they were finalized.
pub fn create_mock_lake_s3_config(block_heights: &[u64]) -> aws_sdk_s3::Config {
    let replay_events = generate_replay_events_for_blocks(block_heights);

    let replay_client = StaticReplayClient::new(replay_events);

    aws_sdk_s3::Config::builder()
        .behavior_version_latest()
        .region(aws_sdk_s3::config::Region::new("eu-central-1"))
        .http_client(replay_client)
        .build()
}

pub fn get_streamer_message(block_height: u64) -> near_indexer_primitives::StreamerMessage {
    let block: near_indexer_primitives::views::BlockView = serde_json::from_slice(
        &std::fs::read(format!(
            "{}/data/{block_height:0>12}/block.json",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap(),
    )
    .unwrap();
    let shards: Vec<near_indexer_primitives::IndexerShard> = vec![
        serde_json::from_slice(
            &std::fs::read(format!(
                "{}/data/{block_height:0>12}/shard_0.json",
                env!("CARGO_MANIFEST_DIR")
            ))
            .unwrap(),
        )
        .unwrap(),
        serde_json::from_slice(
            &std::fs::read(format!(
                "{}/data/{block_height:0>12}/shard_1.json",
                env!("CARGO_MANIFEST_DIR")
            ))
            .unwrap(),
        )
        .unwrap(),
        serde_json::from_slice(
            &std::fs::read(format!(
                "{}/data/{block_height:0>12}/shard_2.json",
                env!("CARGO_MANIFEST_DIR")
            ))
            .unwrap(),
        )
        .unwrap(),
        serde_json::from_slice(
            &std::fs::read(format!(
                "{}/data/{block_height:0>12}/shard_3.json",
                env!("CARGO_MANIFEST_DIR")
            ))
            .unwrap(),
        )
        .unwrap(),
    ];

    near_indexer_primitives::StreamerMessage { block, shards }
}
