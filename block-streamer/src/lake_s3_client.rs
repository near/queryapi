#![cfg_attr(test, allow(dead_code))]

use std::sync::Arc;

use async_trait::async_trait;
use near_lake_framework::s3_client::{GetObjectBytesError, ListCommonPrefixesError};

use crate::metrics;

#[cfg(test)]
pub use MockSharedLakeS3ClientImpl as SharedLakeS3Client;
#[cfg(not(test))]
pub use SharedLakeS3ClientImpl as SharedLakeS3Client;

#[derive(Clone)]
pub struct SharedLakeS3ClientImpl {
    inner: Arc<LakeS3Client>,
}

impl SharedLakeS3ClientImpl {
    pub fn new(inner: LakeS3Client) -> Self {
        Self {
            inner: Arc::new(inner),
        }
    }

    pub fn from_conf(config: aws_sdk_s3::config::Config) -> Self {
        Self {
            inner: Arc::new(LakeS3Client::from_conf(config)),
        }
    }
}

#[async_trait]
impl near_lake_framework::s3_client::S3Client for SharedLakeS3ClientImpl {
    async fn get_object_bytes(
        &self,
        bucket: &str,
        prefix: &str,
    ) -> Result<Vec<u8>, GetObjectBytesError> {
        self.inner.get_object_bytes(bucket, prefix).await
    }

    async fn list_common_prefixes(
        &self,
        bucket: &str,
        start_after_prefix: &str,
    ) -> Result<Vec<String>, ListCommonPrefixesError> {
        self.inner
            .list_common_prefixes(bucket, start_after_prefix)
            .await
    }
}

#[derive(Debug)]
pub struct LakeS3Client {
    s3_client: crate::s3_client::S3Client,
}

impl LakeS3Client {
    pub fn new(s3_client: crate::s3_client::S3Client) -> Self {
        Self { s3_client }
    }

    pub fn from_conf(config: aws_sdk_s3::config::Config) -> Self {
        let s3_client = crate::s3_client::S3Client::new(config);

        Self::new(s3_client)
    }

    async fn get_object_bytes(
        &self,
        bucket: &str,
        prefix: &str,
    ) -> Result<Vec<u8>, GetObjectBytesError> {
        metrics::LAKE_S3_GET_REQUEST_COUNT.inc();

        let object = self.s3_client.get_object(bucket, prefix).await?;

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
            .list_objects(bucket, start_after_prefix, None)
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

#[cfg(test)]
mockall::mock! {
    pub SharedLakeS3ClientImpl {
        pub fn new(inner: LakeS3Client) -> Self;

        pub fn from_conf(config: aws_sdk_s3::config::Config) -> Self;
    }

    #[async_trait]
    impl near_lake_framework::s3_client::S3Client for SharedLakeS3ClientImpl {
        async fn get_object_bytes(
            &self,
            bucket: &str,
            prefix: &str,
        ) -> Result<Vec<u8>, GetObjectBytesError>;

        async fn list_common_prefixes(
            &self,
            bucket: &str,
            start_after_prefix: &str,
        ) -> Result<Vec<String>, ListCommonPrefixesError>;
    }

    impl Clone for SharedLakeS3ClientImpl {
        fn clone(&self) -> Self;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use aws_sdk_s3::operation::get_object::GetObjectOutput;
    use near_lake_framework::s3_client::S3Client;

    #[tokio::test]
    async fn calls_get_object() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();
        mock_s3_client
            .expect_get_object()
            .returning(|_, _| Ok(GetObjectOutput::builder().build()))
            .once();

        let shared_lake_s3_client = SharedLakeS3ClientImpl::new(LakeS3Client::new(mock_s3_client));

        let _ = shared_lake_s3_client
            .get_object_bytes("bucket", "prefix")
            .await;
    }
}
