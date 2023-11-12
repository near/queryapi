#[cfg(test)]
mod tests {
    use crate::historical_block_processing::filter_matching_blocks_from_index_files;
    use crate::indexer_types::IndexerFunction;
    use crate::opts::{ChainId, Opts, StartOptions};
    use crate::{historical_block_processing, opts};
    use chrono::{DateTime, NaiveDate, Utc};
    use indexer_rule_type::indexer_rule::{IndexerRule, IndexerRuleKind, MatchingRule, Status};
    use near_lake_framework::near_indexer_primitives::types::BlockHeight;
    use std::env;
    use std::ops::Range;

    impl Opts {
        pub fn test_opts_with_aws() -> Self {
            dotenv::dotenv().ok();
            Opts {
                aws_access_key_id: env::var("AWS_ACCESS_KEY_ID").unwrap(),
                aws_secret_access_key: env::var("AWS_SECRET_ACCESS_KEY").unwrap(),
                aws_region: "eu-central-1".to_string(),
                redis_connection_string: env::var("REDIS_CONNECTION_STRING").unwrap(),
                registry_contract_id: "".to_string(),
                port: 0,
                chain_id: ChainId::Mainnet(StartOptions::FromLatest),
            }
        }
    }

    /// Parses some env vars from .env, Run with
    /// cargo test historical_block_processing_integration_tests::test_indexing_metadata_file;
    #[tokio::test]
    async fn test_indexing_metadata_file() {
        let aws_config = aws_config::from_env().load().await;
        let s3_client = aws_sdk_s3::Client::new(&aws_config);

        let last_indexed_block =
            historical_block_processing::last_indexed_block_from_metadata(&s3_client)
                .await
                .unwrap();
        let a: Range<u64> = 90000000..9000000000; // valid for the next 300 years
        assert!(a.contains(&last_indexed_block));
    }

    /// Parses some env vars from .env, Run with
    /// cargo test historical_block_processing_integration_tests::test_process_historical_messages;
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

        let opts = Opts::test_opts_with_aws();

        let aws_config = aws_config::from_env().load().await;
        let s3_client = aws_sdk_s3::Client::new(&aws_config);

        let redis_connection_manager = storage::connect(&opts.redis_connection_string)
            .await
            .unwrap();

        let json_rpc_client = near_jsonrpc_client::JsonRpcClient::connect(opts.rpc_url());

        let fake_block_height =
            historical_block_processing::last_indexed_block_from_metadata(&s3_client)
                .await
                .unwrap();
        let result = historical_block_processing::process_historical_messages(
            fake_block_height + 1,
            indexer_function,
            &redis_connection_manager,
            &s3_client,
            &opts.chain_id(),
            &json_rpc_client,
        )
        .await;
        assert!(result.unwrap() > 0);
    }

    /// Parses some env vars from .env, Run with
    /// cargo test historical_block_processing_integration_tests::test_filter_matching_wildcard_blocks_from_index_files;
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
        let indexer_function = IndexerFunction {
            account_id: "buildnear.testnet".to_string().parse().unwrap(),
            function_name: "index_stuff".to_string(),
            code: "".to_string(),
            start_block_height: Some(85376002),
            schema: None,
            provisioned: false,
            indexer_rule: filter_rule,
        };

        let aws_config = aws_config::from_env().load().await;
        let s3_client = aws_sdk_s3::Client::new(&aws_config);

        let start_block_height = 77016214;
        let naivedatetime_utc = NaiveDate::from_ymd_opt(2022, 10, 3)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let datetime_utc = DateTime::<Utc>::from_utc(naivedatetime_utc, Utc);
        let blocks = filter_matching_blocks_from_index_files(
            start_block_height,
            &indexer_function,
            &s3_client,
            datetime_utc,
        )
        .await;

        match blocks {
            Ok(blocks) => {
                // remove any blocks from after when the test was written
                let fixed_blocks: Vec<BlockHeight> =
                    blocks.into_iter().filter(|&b| b <= 95175853u64).collect();
                println!("Found {} blocks", fixed_blocks.len());
                assert!(fixed_blocks.len() >= 71899);
            }
            Err(e) => {
                println!("Error: {:?}", e);
                panic!();
            }
        }
    }

    /// Parses some env vars from .env, Run with
    /// cargo test historical_block_processing_integration_tests::test_filter_matching_blocks_from_index_files;
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
        let indexer_function = IndexerFunction {
            account_id: "buildnear.testnet".to_string().parse().unwrap(),
            function_name: "index_stuff".to_string(),
            code: "".to_string(),
            start_block_height: Some(85376002),
            schema: None,
            provisioned: false,
            indexer_rule: filter_rule,
        };

        let aws_config = aws_config::from_env().load().await;
        let s3_client = aws_sdk_s3::Client::new(&aws_config);

        let start_block_height = 45894620;
        let naivedatetime_utc = NaiveDate::from_ymd_opt(2021, 8, 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let datetime_utc = DateTime::<Utc>::from_utc(naivedatetime_utc, Utc);
        let blocks = filter_matching_blocks_from_index_files(
            start_block_height,
            &indexer_function,
            &s3_client,
            datetime_utc,
        )
        .await;
        let blocks = blocks.unwrap();

        // remove any blocks from after when the test was written
        let fixed_blocks: Vec<BlockHeight> =
            blocks.into_iter().filter(|&b| b <= 95175853u64).collect();
        assert_eq!(fixed_blocks.len(), 197); // hackathon.agency.near = 45894627,45898423, hacker.agency.near = 45897358, hack.agency.near = 45894872,45895120,45896237
    }
}
