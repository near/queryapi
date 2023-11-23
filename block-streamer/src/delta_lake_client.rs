use anyhow::Context;

pub const DELTA_LAKE_BUCKET: &str = "near-delta-lake";
pub const LATEST_BLOCK_METADATA_KEY: &str =
    "silver/accounts/action_receipt_actions/metadata/latest_block.json";

#[derive(serde::Deserialize, Debug, Eq, PartialEq)]
pub struct LatestBlockMetadata {
    last_indexed_block: String,
    first_indexed_block: String,
    last_indexed_block_date: String,
    first_indexed_block_date: String,
    processed_at_utc: String,
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
}

#[cfg(test)]
mod test {
    use super::*;
    use mockall::predicate::*;

    #[tokio::test]
    async fn fetches_metadata_from_s3() {
        let mut mock_s3_client = crate::s3_client::MockS3ClientTrait::new();

        mock_s3_client
            .expect_get_text_file()
            .with(eq(DELTA_LAKE_BUCKET.to_string()), eq(LATEST_BLOCK_METADATA_KEY.to_string()))
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
