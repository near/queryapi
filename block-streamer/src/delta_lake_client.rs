use anyhow::Context;
use chrono::{DateTime, NaiveDate, Utc};
use futures::future::try_join_all;

const MAX_S3_LIST_REQUESTS: usize = 1000;
const DELTA_LAKE_BUCKET: &str = "near-delta-lake";
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

pub struct DeltaLakeClient<T>
where
    T: crate::s3_client::S3ClientTrait,
{
    s3_client: T,
}

impl<T> DeltaLakeClient<T>
where
    T: crate::s3_client::S3ClientTrait,
{
    pub fn new(s3_client: T) -> Self {
        DeltaLakeClient { s3_client }
    }

    pub async fn get_latest_block_metadata(&self) -> anyhow::Result<LatestBlockMetadata> {
        let metadata_file_content = self
            .s3_client
            .get_text_file(DELTA_LAKE_BUCKET, LATEST_BLOCK_METADATA_KEY)
            .await?;

        serde_json::from_str::<LatestBlockMetadata>(&metadata_file_content)
            .context("Unable to parse Metadata")
    }

    fn storage_path_for_account(&self, account: &str) -> String {
        let mut folders = account.split('.').collect::<Vec<&str>>();
        folders.reverse();
        folders.join("/")
    }

    async fn list_index_files_by_wildcard(&self, pattern: &&str) -> anyhow::Result<Vec<String>> {
        // remove sub-account wildcard from pattern
        let pattern = pattern.replace("*.", "");
        let path = self.storage_path_for_account(&pattern);

        let folders = self
            .s3_client
            .list_all_objects(
                DELTA_LAKE_BUCKET,
                &format!("{}/{}/", INDEXED_ACTIONS_PREFIX, path),
            )
            .await?;
        // for each matching folder list files
        let mut results = vec![];
        for folder in folders {
            results.extend(
                self.s3_client
                    .list_all_objects(DELTA_LAKE_BUCKET, &folder)
                    .await?,
            );
        }
        Ok(results)
    }

    pub async fn list_matching_index_files(
        &self,
        contract_pattern: &str,
    ) -> anyhow::Result<Vec<String>> {
        match contract_pattern {
            pattern if pattern.contains(',') => {
                let accounts = pattern.split(',');

                let mut results = vec![];

                for account in accounts {
                    let account = account.trim();

                    if account.contains('*') {
                        results.extend(self.list_index_files_by_wildcard(&account).await?);
                    } else {
                        results.extend(
                            self.s3_client
                                .list_all_objects(
                                    DELTA_LAKE_BUCKET,
                                    &format!(
                                        "{}/{}/",
                                        INDEXED_ACTIONS_PREFIX,
                                        self.storage_path_for_account(account)
                                    ),
                                )
                                .await?,
                        );
                    };
                }

                Ok(results)
            }
            pattern if pattern.contains('*') => self.list_index_files_by_wildcard(&pattern).await,
            pattern => {
                self.s3_client
                    .list_all_objects(
                        DELTA_LAKE_BUCKET,
                        &format!(
                            "{}/{}/",
                            INDEXED_ACTIONS_PREFIX,
                            self.storage_path_for_account(pattern),
                        ),
                    )
                    .await
            }
        }
    }

    fn file_name_date_after(&self, start_date: DateTime<Utc>, file_name: &str) -> bool {
        let file_name_date = file_name.split('/').last().unwrap().replace(".json", "");
        let file_name_date = NaiveDate::parse_from_str(&file_name_date, "%Y-%m-%d");
        match file_name_date {
            Ok(file_name_date) => file_name_date >= start_date.date_naive(),
            Err(e) => {
                // if we can't parse the date assume a file this code is not meant to handle
                tracing::debug!(
                    target: crate::LOG_TARGET,
                    "Error parsing file name date: {:?}",
                    e
                );
                false
            }
        }
    }

    pub async fn list_matching_block_heights(
        &self,
        start_date: DateTime<Utc>,
        contract_pattern: &str,
    ) -> anyhow::Result<Vec<String>> {
        let file_list = self.list_matching_index_files(contract_pattern).await?;
        tracing::debug!(
            "Found {} index files matching {}",
            file_list.len(),
            contract_pattern,
        );

        let fetch_and_parse_tasks = file_list
            .into_iter()
            .filter(|index_file_listing| self.file_name_date_after(start_date, index_file_listing))
            .map(|key| {
                async move {
                    // Fetch the file
                    self.s3_client.get_text_file(DELTA_LAKE_BUCKET, &key).await
                }
            })
            .collect::<Vec<_>>();

        // Execute all tasks in parallel and wait for completion
        let file_content_list = try_join_all(fetch_and_parse_tasks).await?;

        Ok(file_content_list
            .into_iter()
            .filter(|file_contents| !file_contents.is_empty())
            .collect::<Vec<String>>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate;

    #[tokio::test]
    async fn fetches_metadata_from_s3() {
        let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

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
    async fn lists_block_heights_for_single_account() {
        let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

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
            .list_matching_block_heights(
                NaiveDate::from_ymd_opt(2023, 5, 16)
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap()
                    .and_utc(),
                "queryapi.dataplatform.near",
            )
            .await
            .unwrap();

        assert_eq!(
            block_heights,
            vec![
                "{\"heights\":[92080299,92080344],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[92080344,92080299]}]}"
            ]
        )
    }

    #[tokio::test]
    async fn lists_block_heights_for_multiple_accounts() {
        let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

        mock_s3_client
            .expect_list_all_objects()
            // FIX: This syntax is preferable as it will assert the use of the arguments - but it causes a compiler error in this specific case
            // .with(predicate::eq(DELTA_LAKE_BUCKET), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/".to_string()))
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
            .returning(|_bucket, _prefix| Ok("{\"heights\":[93065811,93067570,93067619,93067631,93067726,93067737,93067770,93067889,93067920,93067926,93067936,93073935,93073944,93073954],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[93073954,93067770,93067726,93065811,93067619,93073935,93067889,93067737,93067570,93067926,93073944,93067920,93067631,93067936]}]}".to_string()));
        mock_s3_client
            .expect_get_text_file()
            .with(predicate::eq(DELTA_LAKE_BUCKET.to_string()), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/sputnik-dao/hackathon/2022-05-27.json".to_string()))
            .returning(|_bucket, _prefix| Ok("{\"heights\":[66494954],\"actions\":[{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[66494954]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[66494954]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[66494954]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[66494954]}]}".to_string()));

        let delta_lake_client = DeltaLakeClient::new(mock_s3_client);

        let block_heights = delta_lake_client
            .list_matching_block_heights(
                NaiveDate::from_ymd_opt(2022, 5, 26)
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap()
                    .and_utc(),
                "hackathon.agency.near, hackathon.aurora-silo-dev.near, hackathon.sputnik-dao.near",
            )
            .await
            .unwrap();

        assert_eq!(
            block_heights,
            vec![
                "{\"heights\":[92167977,92168200,92168293,92168338,92168535,92168870,92168871,92168922,92168923,92168939,92168971,92169330],\"actions\":[{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[92168200,92168338]},{\"action_kind\":\"ADD_KEY\",\"block_heights\":[92168535,92167977]},{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[92167977]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[92168922,92168971,92168870]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[92168871,92168923,92169330,92168293,92168939,92167977]}]}",
                "{\"heights\":[93065811,93067570,93067619,93067631,93067726,93067737,93067770,93067889,93067920,93067926,93067936,93073935,93073944,93073954],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[93073954,93067770,93067726,93065811,93067619,93073935,93067889,93067737,93067570,93067926,93073944,93067920,93067631,93067936]}]}",
                "{\"heights\":[66494954],\"actions\":[{\"action_kind\":\"CREATE_ACCOUNT\",\"block_heights\":[66494954]},{\"action_kind\":\"DEPLOY_CONTRACT\",\"block_heights\":[66494954]},{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[66494954]},{\"action_kind\":\"TRANSFER\",\"block_heights\":[66494954]}]}"
            ]
        )
    }

    #[tokio::test]
    async fn lists_block_heights_for_wildcard() {
        let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

        mock_s3_client
            .expect_list_all_objects()
            // FIX: This syntax is preferable as it will assert the use of the arguments - but it causes a compiler error in this specific case
            // .with(predicate::eq(DELTA_LAKE_BUCKET), predicate::eq("silver/accounts/action_receipt_actions/metadata/near/agency/hackathon/".to_string()))
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
            .list_matching_block_heights(
                NaiveDate::from_ymd_opt(2023, 5, 26)
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap()
                    .and_utc(),
                "*.keypom.near",
            )
            .await
            .unwrap();

        assert_eq!(
            block_heights,
            vec![
                "{\"heights\":[102025554],\"actions\":[{\"action_kind\":\"FUNCTION_CALL\",\"block_heights\":[102025554]}]}",
                "{\"heights\":[104045849,104047967,104047968],\"actions\":[{\"action_kind\":\"TRANSFER\",\"block_heights\":[104047968,104045849,104047967]}]}",
                "{\"heights\":[104616819],\"actions\":[{\"action_kind\":\"ADD_KEY\",\"block_heights\":[104616819]}]}"
            ]
        )
    }

    // #[tokio::test]
    // #[ignore]
    // async fn list_with_csv_and_wildcard_contracts() {
    //     let aws_config = aws_config::from_env().load().await;
    //     let s3_client = crate::s3_client::S3Client::new(&aws_config);
    //
    //     let delta_lake_client = DeltaLakeClient::new(s3_client);
    //
    //     let list = delta_lake_client
    //         .list_matching_index_files("*.keypom.near, hackathon.agency.near, *.nearcrowd.near")
    //         .await
    //         .unwrap();
    //
    //     assert!(list.len() >= 1370);
    // }
}
