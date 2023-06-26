use crate::indexer_types::IndexerFunction;
use crate::opts::{Opts, Parser};
use crate::{historical_block_processing, opts};
use aws_types::SdkConfig;
use indexer_rule_type::indexer_rule::{IndexerRule, IndexerRuleKind, MatchingRule, Status};
use std::ops::Range;

/// Run with export $(grep -v '^#' .env | xargs) && cargo test historical_block_processing_integration_tests::test_indexing_metadata_file -- mainnet from-latest;
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

/// Run with export $(grep -v '^#' .env | xargs) && cargo test historical_block_processing_integration_tests::test_process_historical_messages -- mainnet from-latest;
// next step is to mock the queue
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
