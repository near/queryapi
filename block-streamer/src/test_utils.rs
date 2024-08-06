use aws_smithy_runtime::client::http::test_util::{ReplayEvent, StaticReplayClient};
use aws_smithy_types::body::SdkBody;
use chrono::TimeZone;
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

pub fn utc_date_time_from_date_string(date: &str) -> chrono::DateTime<chrono::Utc> {
    let naive_date_time: chrono::NaiveDateTime =
        chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
    chrono::TimeZone::from_utc_datetime(&chrono::Utc, &naive_date_time)
}

pub fn generate_block_with_date(date: &str) -> String {
    let naive_date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap();
    return generate_block_with_timestamp(&naive_date.format("%Y-%m-%dT%H:%M:%S").to_string());
}

pub fn generate_block_with_timestamp(date: &str) -> String {
    let naive_date = chrono::NaiveDateTime::parse_from_str(date, "%Y-%m-%dT%H:%M:%S").unwrap();

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
