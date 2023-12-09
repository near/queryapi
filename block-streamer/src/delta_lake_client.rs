use crate::rules::types::indexer_rule_match::ChainId;
use anyhow::Context;
use chrono::TimeZone;
use futures::future::try_join_all;
use near_lake_framework::near_indexer_primitives;

const DELTA_LAKE_BUCKET: &str = "near-delta-lake";
const MAX_S3_RETRY_COUNT: u8 = 20;
const INDEXED_ACTIONS_PREFIX: &str = "silver/accounts/action_receipt_actions/metadata";
const LATEST_BLOCK_METADATA_KEY: &str =
    "silver/accounts/action_receipt_actions/metadata/latest_block.json";

#[derive(serde::Deserialize, Debug, Eq, PartialEq)]
pub struct LatestBlockMetadata {
    pub last_indexed_block: String,
    pub first_indexed_block: String,
    pub last_indexed_block_date: String,
    pub first_indexed_block_date: String,
    pub processed_at_utc: String,
}

#[derive(serde::Deserialize, Debug, Eq, PartialEq)]
pub struct IndexFileAction {
    pub action_kind: String,
    pub block_heights: Vec<near_indexer_primitives::types::BlockHeight>,
}

#[derive(serde::Deserialize, Debug, Eq, PartialEq)]
pub struct IndexFile {
    pub heights: Vec<near_indexer_primitives::types::BlockHeight>,
    pub actions: Vec<IndexFileAction>,
}

#[derive(Clone)]
pub struct DeltaLakeClient<T>
where
    T: crate::s3_client::S3Operations,
{
    s3_client: T,
    chain_id: ChainId,
}

impl<T> DeltaLakeClient<T>
where
    T: crate::s3_client::S3Operations,
{
    pub fn new(s3_client: T) -> Self {
        DeltaLakeClient {
            s3_client,
            // hardcode to mainnet for now
            chain_id: ChainId::Mainnet,
        }
    }

    pub async fn get_latest_block_metadata(&self) -> anyhow::Result<LatestBlockMetadata> {
        let metadata_file_content = self
            .s3_client
            .get_text_file(DELTA_LAKE_BUCKET, LATEST_BLOCK_METADATA_KEY)
            .await?;

        serde_json::from_str::<LatestBlockMetadata>(&metadata_file_content)
            .context("Unable to parse Metadata")
    }

    fn get_lake_bucket(&self) -> String {
        match self.chain_id {
            ChainId::Mainnet => "near-lake-data-mainnet".to_string(),
            ChainId::Testnet => "near-lake-data-testnet".to_string(),
        }
    }

    pub async fn get_nearest_block_date(
        &self,
        block_height: u64,
    ) -> anyhow::Result<chrono::DateTime<chrono::Utc>> {
        let mut current_block_height = block_height;
        let mut retry_count = 1;
        loop {
            let block_key = format!("{:0>12}/block.json", current_block_height);
            match self
                .s3_client
                .get_text_file(&self.get_lake_bucket(), &block_key)
                .await
            {
                Ok(text) => {
                    let block: near_indexer_primitives::views::BlockView =
                        serde_json::from_str(&text)?;
                    return Ok(chrono::Utc.timestamp_nanos(block.header.timestamp_nanosec as i64));
                }

                Err(e) => {
                    if e.root_cause()
                        .downcast_ref::<aws_sdk_s3::types::error::NoSuchKey>()
                        .is_some()
                    {
                        retry_count += 1;
                        if retry_count > MAX_S3_RETRY_COUNT {
                            anyhow::bail!("Exceeded maximum retries to fetch block from S3");
                        }

                        tracing::debug!(
                            "Block {} not found on S3, attempting to fetch next block",
                            current_block_height
                        );
                        current_block_height += 1;
                        continue;
                    }

                    return Err(e).context("Failed to fetch block from S3");
                }
            }
        }
    }

    fn s3_prefix_from_contract_id(&self, contract_id: &str) -> String {
        let mut folders = contract_id.split('.').collect::<Vec<_>>();
        folders.reverse();

        format!("{}/{}/", INDEXED_ACTIONS_PREFIX, folders.join("/"))
    }

    async fn list_objects_recursive(
        &self,
        prefix: &str,
        depth: u32,
    ) -> anyhow::Result<Vec<String>> {
        if depth > 1 {
            unimplemented!("Recursive list with depth > 1 not supported")
        }

        let objects = self
            .s3_client
            .list_all_objects(DELTA_LAKE_BUCKET, prefix)
            .await?;

        let mut results = vec![];
        // TODO do in parallel?
        // TODO only list objects without .json extension
        for object in objects {
            results.extend(
                self.s3_client
                    .list_all_objects(DELTA_LAKE_BUCKET, &object)
                    .await?,
            );
        }

        Ok(results)
    }

    async fn list_matching_index_files(
        &self,
        contract_pattern: &str,
    ) -> anyhow::Result<Vec<String>> {
        match contract_pattern {
            pattern if pattern.contains(',') => {
                let contract_ids = pattern.split(',');

                let mut results = vec![];

                for contract_id in contract_ids {
                    let contract_id = contract_id.trim();

                    if contract_id.contains('*') {
                        let pattern = contract_id.replace("*.", "");
                        results.extend(
                            self.list_objects_recursive(
                                &self.s3_prefix_from_contract_id(&pattern),
                                1,
                            )
                            .await?,
                        );
                    } else {
                        results.extend(
                            self.s3_client
                                .list_all_objects(
                                    DELTA_LAKE_BUCKET,
                                    &self.s3_prefix_from_contract_id(contract_id),
                                )
                                .await?,
                        );
                    };
                }

                Ok(results)
            }
            pattern if pattern.contains('*') => {
                let contract_id = pattern.replace("*.", "");
                self.list_objects_recursive(&self.s3_prefix_from_contract_id(&contract_id), 1)
                    .await
            }
            pattern => {
                self.s3_client
                    .list_all_objects(DELTA_LAKE_BUCKET, &self.s3_prefix_from_contract_id(pattern))
                    .await
            }
        }
    }

    fn date_from_s3_path(&self, path: &str) -> Option<chrono::NaiveDate> {
        let file_name_date = path.split('/').last()?.replace(".json", "");

        chrono::NaiveDate::parse_from_str(&file_name_date, "%Y-%m-%d").ok()
    }

    pub async fn list_matching_block_heights(
        &self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        contract_pattern: &str,
    ) -> anyhow::Result<Vec<near_indexer_primitives::types::BlockHeight>> {
        let start_date = self.get_nearest_block_date(start_block_height).await?;

        let file_list = self.list_matching_index_files(contract_pattern).await?;
        tracing::debug!(
            "Found {} index files matching {}",
            file_list.len(),
            contract_pattern,
        );

        let futures = file_list
            .into_iter()
            // TODO use `start_after` in the request to S3 to avoid this filter
            .filter(|file_path| {
                self.date_from_s3_path(file_path)
                    // Ignore invalid paths, i.e. sub-folders, by default
                    .map_or(false, |file_date| file_date >= start_date.date_naive())
            })
            .map(|key| async move { self.s3_client.get_text_file(DELTA_LAKE_BUCKET, &key).await })
            .collect::<Vec<_>>();

        tracing::debug!(
            "Found {} index files matching {} after date {}",
            futures.len(),
            contract_pattern,
            start_date
        );

        let file_content_list = try_join_all(futures).await?;

        let mut block_heights: Vec<_> = file_content_list
            .into_iter()
            .filter_map(|content| {
                if content.is_empty() {
                    None
                } else {
                    serde_json::from_str::<IndexFile>(&content).ok()
                }
            })
            .flat_map(|index_file| index_file.heights)
            .collect();

        let pattern_has_multiple_contracts = contract_pattern.chars().any(|c| c == ',' || c == '*');
        if pattern_has_multiple_contracts {
            block_heights.sort();
            block_heights.dedup();
        }

        tracing::debug!(
            "Found {} matching block heights matching {}",
            block_heights.len(),
            contract_pattern,
        );

        // TODO Remove all block heights after start_block_height
        Ok(block_heights)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate;

    fn generate_block_with_timestamp(date: &str) -> String {
        let naive_date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();

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

    #[tokio::test]
    async fn fetches_metadata_from_s3() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET), predicate::eq(LATEST_BLOCK_METADATA_KEY))
            .returning(|_bucket, _prefix| Ok("{ \"last_indexed_block\": \"106309326\", \"first_indexed_block\": \"106164983\", \"last_indexed_block_date\": \"2023-11-22\", \"first_indexed_block_date\": \"2023-11-21\", \"processed_at_utc\": \"2023-11-22 23:06:24.358000\" }".to_string()));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let latest_block_metadata = delta_lake_client.get_latest_block_metadata().await.unwrap();

        assert_eq!(
            latest_block_metadata,
            LatestBlockMetadata {
                last_indexed_block: "106309326".to_string(),
                first_indexed_block: "106164983".to_string(),
                last_indexed_block_date: "2023-11-22".to_string(),
                first_indexed_block_date: "2023-11-21".to_string(),
                processed_at_utc: "2023-11-22 23:06:24.358000".to_string(),
            }
        )
    }

    #[tokio::test]
    async fn lists_block_heights_for_single_contract() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000091940840/block.json"),
            )
            .returning(|_bucket, _prefix| Ok(generate_block_with_timestamp("2023-05-16")));
        mock_s3_client
            .expect_list_all_objects()
            .returning(|_bucket, _prefix| {
                Ok(vec![
                    "silver/accounts/action_receipt_actions/metadata/near/dataplatform/queryapi/2023-05-15.json".to_string(),
                    "silver/accounts/action_receipt_actions/metadata/near/dataplatform/queryapi/2023-05-17.json".to_string(),
                ])
            });
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/dataplatform/queryapi/2023-05-15.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[91940840,91942989],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[91942989,91940840]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/dataplatform/queryapi/2023-05-17.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[92080299,92080344],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[92080344,92080299]}]}".to_string()));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_heights = delta_lake_client
            .list_matching_block_heights(91940840, "queryapi.dataplatform.near")
            .await
            .unwrap();

        assert_eq!(block_heights, vec![92080299, 92080344])
    }

    #[tokio::test]
    async fn lists_block_heights_for_multiple_contracts() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000045894617/block.json"),
            )
            .returning(|_bucket, _prefix| Ok(generate_block_with_timestamp("2022-05-26")));
        mock_s3_client
            .expect_list_all_objects()
            .returning(|_bucket, prefix| {
                let objects = match prefix {
                    "silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/2021-08-22.json".to_string()
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/aurora-silo-dev/hackathon/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/aurora-silo-dev/hackathon/2023-05-18.json".to_string(),
                        "silver/accounts/action_receipt_actions/metadata/near/aurora-silo-dev/hackathon/2023-05-30.json".to_string(),
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/sputnik-dao/hackathon/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/sputnik-dao/hackathon/2022-05-27.json".to_string()
                    ],
                    _ => panic!("Unexpected prefix: {}", prefix)
                };

                Ok(objects)
            });
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/2021-08-22.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[45894617,45894627,45894628,45894712,45898413,45898423,45898424],\"actions\":[{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[45894617,45898413]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[45898423,45894627]},{\"action_kind\":\"DELETE_ACCOUNT\",\"block_heights\":[45894712]},{\"action_kind\":\"ADD_KEY\",\"block_heights\":[45894617,45898413]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[45894628,45894617,45898424,45898413]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[45898423,45894627]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/aurora-silo-dev/hackathon/2023-05-18.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[92167977,92168200,92168293,92168338,92168535,92168870,92168871,92168922,92168923,92168939,92168971,92169330],\"actions\":[{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[92168200,92168338]},{\"action_kind\":\"ADD_KEY\",\"block_heights\":[92168535,92167977]},{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[92167977]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[92168922,92168971,92168870]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[92168871,92168923,92169330,92168293,92168939,92167977]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/aurora-silo-dev/hackathon/2023-05-30.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[92167977,93067570,93067619,93067631,93067726,93067737,93067770,93067889,93067920,93067926,93067936,93073935,93073944,93073954],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[93073954,93067770,93067726,93065811,93067619,93073935,93067889,93067737,93067570,93067926,93073944,93067920,93067631,93067936]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/sputnik-dao/hackathon/2022-05-27.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[66494954],\"actions\":[{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[66494954]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[66494954]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[66494954]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[66494954]}]}".to_string()));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_heights = delta_lake_client
            .list_matching_block_heights(
                45894617,
                "hackathon.agency.near, hackathon.aurora-silo-dev.near, hackathon.sputnik-dao.near",
            )
            .await
            .unwrap();

        assert_eq!(
            block_heights,
            vec![
                66494954, 92167977, 92168200, 92168293, 92168338, 92168535, 92168870, 92168871,
                92168922, 92168923, 92168939, 92168971, 92169330, 93067570, 93067619, 93067631,
                93067726, 93067737, 93067770, 93067889, 93067920, 93067926, 93067936, 93073935,
                93073944, 93073954
            ]
        )
    }

    #[tokio::test]
    async fn lists_block_heights_for_wildcard() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000078516467/block.json"),
            )
            .returning(|_bucket, _prefix| Ok(generate_block_with_timestamp("2023-05-26")));
        mock_s3_client
            .expect_list_all_objects()
            .returning(|_bucket, prefix| {
                let objects = match prefix {
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/".to_string(),
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/nft/".to_string(),
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-23.json".to_string(),
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string(),
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15.json".to_string(),
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/nft/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/nft/2023-09-26.json".to_string(),
                    ],

                    "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-23.json" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-23.json".to_string()
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string()
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15.json" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15json".to_string()
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/nft/2023-09-26.json" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/nft/2023-09-26.json".to_string()
                    ],
                    _ => panic!("Unexpected prefix: {}", prefix)
                };

                Ok(objects)
            });
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[78516467,78516476,78516489,78516511,78516512],\"actions\":[{\"action_kind\":\"DELETE_ACCOUNT\",\"block_heights\":[78516467]},{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[78516476]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[78516476,78516512]},{\"action_kind\":\"ADD_KEY\",\"block_heights\":[78516476]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[78516511]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[78516489]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/keypom/nft/2023-09-26.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[102025554],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[102025554]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-23.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[104045849,104047967,104047968],\"actions\":[{\"action_kind\":\"TRANSFER\",\"block_heights\":[104047968,104045849,104047967]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[104616819],\"actions\":[{\"action_kind\":\"ADD_KEY\",\"block_heights\":[104616819]}]}".to_string()));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_heights = delta_lake_client
            .list_matching_block_heights(78516467, "*.keypom.near")
            .await
            .unwrap();

        assert_eq!(
            block_heights,
            vec![102025554, 104045849, 104047967, 104047968, 104616819]
        )
    }

    #[tokio::test]
    async fn lists_block_heights_for_multiple_contracts_and_wildcard() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000045894617/block.json"),
            )
            .returning(|_bucket, _prefix| Ok(generate_block_with_timestamp("2021-05-26")));
        mock_s3_client
            .expect_list_all_objects()
            .returning(|_bucket, prefix| {
                let objects = match prefix {
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/".to_string(),
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string(),
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15.json".to_string(),
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/2021-08-22.json".to_string()
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string()
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15.json" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15json".to_string()
                    ],
                    _ => panic!("Unexpected prefix: {}", prefix)
                };

                Ok(objects)
            });
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/2021-08-22.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[45894617,45894627,45894628,45894712,45898413,45898423,45898424],\"actions\":[{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[45894617,45898413]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[45898423,45894627]},{\"action_kind\":\"DELETE_ACCOUNT\",\"block_heights\":[45894712]},{\"action_kind\":\"ADD_KEY\",\"block_heights\":[45894617,45898413]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[45894628,45894617,45898424,45898413]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[45898423,45894627]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/keypom/beta/2022-11-15.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[78516467,78516476,78516489,78516511,78516512],\"actions\":[{\"action_kind\":\"DELETE_ACCOUNT\",\"block_heights\":[78516467]},{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[78516476]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[78516476,78516512]},{\"action_kind\":\"ADD_KEY\",\"block_heights\":[78516476]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[78516511]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[78516489]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[104616819],\"actions\":[{\"action_kind\":\"ADD_KEY\",\"block_heights\":[104616819]}]}".to_string()));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_heights = delta_lake_client
            .list_matching_block_heights(45894617, "*.keypom.near, hackathon.agency.near")
            .await
            .unwrap();

        assert_eq!(
            block_heights,
            vec![
                45894617, 45894627, 45894628, 45894712, 45898413, 45898423, 45898424, 78516467,
                78516476, 78516489, 78516511, 78516512, 104616819
            ]
        )
    }

    #[tokio::test]
    async fn sorts_and_removes_duplicates_for_multiple_contracts() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000045894628/block.json"),
            )
            .returning(|_bucket, _prefix| Ok(generate_block_with_timestamp("2021-05-26")));
        mock_s3_client
            .expect_list_all_objects()
            .returning(|_bucket, prefix| {
                let objects = match prefix {
                    "silver/accounts/action_receipt_actions/metadata/near/keypom/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string(),
                    ],
                    "silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/" => vec![
                        "silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/2021-08-22.json".to_string()
                    ],

                    _ => panic!("Unexpected prefix: {}", prefix)
                };

                Ok(objects)
            });
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/2021-08-22.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[45894628,45894617,45898413,45894627,45894712,45898423,45898424],\"actions\":[{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[45894617,45898413]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[45898423,45894627]},{\"action_kind\":\"DELETE_ACCOUNT\",\"block_heights\":[45894712]},{\"action_kind\":\"ADD_KEY\",\"block_heights\":[45894617,45898413]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[45894628,45894617,45898424,45898413]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[45898423,45894627]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/keypom/2023-10-31.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[45898424,45898423,45898413,45894712],\"actions\":[{\"action_kind\":\"ADD_KEY\",\"block_heights\":[104616819]}]}".to_string()));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_heights = delta_lake_client
            .list_matching_block_heights(45894628, "keypom.near, hackathon.agency.near")
            .await
            .unwrap();

        assert_eq!(
            block_heights,
            vec![45894617, 45894627, 45894628, 45894712, 45898413, 45898423, 45898424]
        )
    }

    #[tokio::test]
    async fn gets_the_date_of_the_closest_block() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000106397175/block.json"),
            )
            .times(1)
            .returning(|_bucket, _prefix| Ok(generate_block_with_timestamp("2021-05-26")));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_date = delta_lake_client
            .get_nearest_block_date(106397175)
            .await
            .unwrap();

        assert_eq!(block_date, chrono::Utc.timestamp_nanos(1621987200000000000));
    }

    #[tokio::test]
    async fn retires_if_a_block_doesnt_exist() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000106397175/block.json"),
            )
            .times(1)
            .returning(|_, _| {
                Err(anyhow::anyhow!(
                    aws_sdk_s3::types::error::NoSuchKey::builder().build()
                ))
            });
        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet"),
                predicate::eq("000106397176/block.json"),
            )
            .times(1)
            .returning(|_bucket, _prefix| Ok(generate_block_with_timestamp("2021-05-26")));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_date = delta_lake_client
            .get_nearest_block_date(106397175)
            .await
            .unwrap();

        assert_eq!(block_date, chrono::Utc.timestamp_nanos(1621987200000000000));
    }

    #[tokio::test]
    async fn exits_if_maximum_retries_exceeded() {
        let mut mock_s3_client = crate::s3_client::MockS3Operations::new();

        mock_s3_client
            .expect_get_text_file()
            .times(MAX_S3_RETRY_COUNT as usize)
            .returning(|_, _| {
                Err(anyhow::anyhow!(
                    aws_sdk_s3::types::error::NoSuchKey::builder().build()
                ))
            });

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let result = delta_lake_client.get_nearest_block_date(106397175).await;

        assert!(result.is_err());
    }
}
