use async_trait::async_trait;
use near_lake_framework::s3_client::{GetObjectBytesError, ListCommonPrefixesError};

#[derive(Clone, Debug)]
pub struct LakeS3Client {
    s3_client: aws_sdk_s3::Client,
}

impl LakeS3Client {
    pub fn new(s3_client: aws_sdk_s3::Client) -> Self {
        Self { s3_client }
    }
}

impl LakeS3Client {
    pub fn from_conf(config: aws_sdk_s3::config::Config) -> Self {
        let s3_client = aws_sdk_s3::Client::from_conf(config);

        Self { s3_client }
    }
}

#[async_trait]
impl near_lake_framework::s3_client::S3Client for LakeS3Client {
    async fn get_object_bytes(
        &self,
        bucket: &str,
        prefix: &str,
    ) -> Result<Vec<u8>, GetObjectBytesError> {
        let object = self
            .s3_client
            .get_object()
            .bucket(bucket)
            .key(prefix)
            .request_payer(aws_sdk_s3::types::RequestPayer::Requester)
            .send()
            .await?;

        let bytes = object.body.collect().await?.into_bytes().to_vec();

        Ok(bytes)
    }

    async fn list_common_prefixes(
        &self,
        bucket: &str,
        start_after_prefix: &str,
    ) -> Result<Vec<String>, ListCommonPrefixesError> {
        let response = self
            .s3_client
            .list_objects_v2()
            .max_keys(1000)
            .delimiter("/".to_string())
            .start_after(start_after_prefix)
            .request_payer(aws_sdk_s3::types::RequestPayer::Requester)
            .bucket(bucket)
            .send()
            .await?;

        let prefixes = match response.common_prefixes {
            None => vec![],
            Some(common_prefixes) => common_prefixes
                .into_iter()
                .filter_map(|common_prefix| common_prefix.prefix)
                .collect::<Vec<String>>()
                .into_iter()
                .filter_map(|prefix_string| prefix_string.split('/').next().map(String::from))
                .collect(),
        };

        Ok(prefixes)
    }
}
