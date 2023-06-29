use crate::historical_block_processing::filter_matching_blocks_from_index_files;
use crate::indexer_types::IndexerFunction;
use crate::opts::{Opts, Parser};
use crate::{historical_block_processing, opts};
use aws_types::SdkConfig;
use chrono::{DateTime, NaiveDate, Utc};
use indexer_rule_type::indexer_rule::{IndexerRule, IndexerRuleKind, MatchingRule, Status};
use near_lake_framework::near_indexer_primitives::types::BlockHeight;
use std::ops::Range;

/// Parses env vars from .env, Run with
/// cargo test historical_block_processing_integration_tests::test_indexing_metadata_file -- mainnet from-latest;
#[tokio::test]
async fn test_indexing_metadata_file() {
    let opts = Opts::parse();
    let aws_config: &SdkConfig = &opts.lake_aws_sdk_config();

    let last_indexed_block =
        historical_block_processing::last_indexed_block_from_metadata(aws_config)
            .await
            .unwrap();
    let a: Range<u64> = 90000000..9000000000; // valid for the next 300 years
    assert!(a.contains(&last_indexed_block));
}

/// Parses env vars from .env, Run with
/// cargo test historical_block_processing_integration_tests::test_process_historical_messages -- mainnet from-latest;
#[tokio::test]
async fn test_process_historical_messages() {
    opts::init_tracing();

    let contract = "queryapi.dataplatform.near";
    let matching_rule = MatchingRule::ActionAny {
        affected_account_id: contract.to_string(),
        status: Status::Any,
    };
    let filter_rule = IndexerRule {
        indexer_rule_kind: IndexerRuleKind::Action,
        matching_rule,
        id: None,
        name: None,
    };
    let indexer_function = IndexerFunction {
        account_id: "buildnear.testnet".to_string().parse().unwrap(),
        function_name: "index_stuff".to_string(),
        code: "".to_string(),
        start_block_height: Some(85376002),
        schema: None,
        provisioned: false,
        indexer_rule: filter_rule,
    };

    let opts = Opts::parse();
    let aws_config: &SdkConfig = &opts.lake_aws_sdk_config();
    let fake_block_height =
        historical_block_processing::last_indexed_block_from_metadata(aws_config)
            .await
            .unwrap();
    historical_block_processing::process_historical_messages(
        fake_block_height + 1,
        indexer_function,
    )
    .await;
}

/// Parses env vars from .env, Run with
/// cargo test historical_block_processing_integration_tests::test_filter_matching_wildcard_blocks_from_index_files -- mainnet from-latest;
#[tokio::test]
async fn test_filter_matching_wildcard_blocks_from_index_files() {
    let contract = "*.keypom.near";
    let matching_rule = MatchingRule::ActionAny {
        affected_account_id: contract.to_string(),
        status: Status::Any,
    };
    let filter_rule = IndexerRule {
        indexer_rule_kind: IndexerRuleKind::Action,
        matching_rule,
        id: None,
        name: None,
    };

    let opts = Opts::parse();
    let aws_config: &SdkConfig = &opts.lake_aws_sdk_config();

    let start_block_height = 75472603;
    let naivedatetime_utc = NaiveDate::from_ymd_opt(2022, 10, 03)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap();
    let datetime_utc = DateTime::<Utc>::from_utc(naivedatetime_utc, Utc);
    let blocks = filter_matching_blocks_from_index_files(
        start_block_height,
        &filter_rule,
        aws_config,
        datetime_utc,
    )
    .await;

    // // remove any blocks from after when the test was written -- not working, due to new contracts?
    // let fixed_blocks: Vec<BlockHeight> = blocks.into_iter().filter(|&b| b <= 95175853u64).collect(); // 95175853u64  95242647u64
    assert!(blocks.len() > 21830); // 22913 raw, deduped to 21830
}

/// Parses env vars from .env, Run with
/// cargo test historical_block_processing_integration_tests::test_filter_matching_blocks_from_index_files -- mainnet from-latest;
#[tokio::test]
async fn test_filter_matching_blocks_from_index_files() {
    let contract = "*.agency.near";
    let matching_rule = MatchingRule::ActionAny {
        affected_account_id: contract.to_string(),
        status: Status::Any,
    };
    let filter_rule = IndexerRule {
        indexer_rule_kind: IndexerRuleKind::Action,
        matching_rule,
        id: None,
        name: None,
    };

    let opts = Opts::parse();
    let aws_config: &SdkConfig = &opts.lake_aws_sdk_config();

    let start_block_height = 45894620;
    let naivedatetime_utc = NaiveDate::from_ymd_opt(2021, 08, 01)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap();
    let datetime_utc = DateTime::<Utc>::from_utc(naivedatetime_utc, Utc);
    let blocks = filter_matching_blocks_from_index_files(
        start_block_height,
        &filter_rule,
        aws_config,
        datetime_utc,
    )
    .await;

    // remove any blocks from after when the test was written
    let fixed_blocks: Vec<BlockHeight> = blocks.into_iter().filter(|&b| b <= 95175853u64).collect();
    assert_eq!(fixed_blocks.len(), 6); // hackathon.agency.near = 45894627,45898423, hacker.agency.near = 45897358, hack.agency.near = 45894872,45895120,45896237
}
