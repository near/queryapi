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
    use mockall::predicate::*;

    #[tokio::test]
    async fn fetches_metadata_from_s3() {
        let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

        mock_s3_client
            .expect_get_text_file()
            .with(eq(DELTA_LAKE_BUCKET), eq(LATEST_BLOCK_METADATA_KEY))
            .returning(|_bucket, _prefix| Box::pin(async move { Ok("{ \"last_indexed_block\": \"106309326\", \"first_indexed_block\": \"106164983\", \"last_indexed_block_date\": \"2023-11-22\", \"first_indexed_block_date\": \"2023-11-21\", \"processed_at_utc\": \"2023-11-22 23:06:24.358000\" }".to_string()) }));

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
}
