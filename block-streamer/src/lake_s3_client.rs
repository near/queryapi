#![cfg_attr(test, allow(dead_code))]

use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;
use futures::future::Shared;
use futures::{Future, FutureExt};
use near_lake_framework::s3_client::{GetObjectBytesError, ListCommonPrefixesError};
use tokio::sync::RwLock;

use crate::metrics;

#[cfg(test)]
pub use MockSharedLakeS3ClientImpl as SharedLakeS3Client;
#[cfg(not(test))]
pub use SharedLakeS3ClientImpl as SharedLakeS3Client;

type GetObjectBytesResult = Result<Vec<u8>, GetObjectBytesError>;

type GetObjectBytesFuture = Pin<Box<dyn Future<Output = GetObjectBytesResult> + Send>>;

type SharedGetObjectBytesFuture = Shared<GetObjectBytesFuture>;

type ListCommonPrefixesResult = Result<Vec<String>, ListCommonPrefixesError>;

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
    async fn get_object_bytes(&self, bucket: &str, prefix: &str) -> GetObjectBytesResult {
        self.inner.get_object_bytes_cached(bucket, prefix).await
    }

    async fn list_common_prefixes(
        &self,
        bucket: &str,
        start_after_prefix: &str,
    ) -> ListCommonPrefixesResult {
        self.inner
            .list_common_prefixes(bucket, start_after_prefix)
            .await
    }
}

#[derive(Debug)]
pub struct LakeS3Client {
    s3_client: crate::s3_client::S3Client,
    futures_cache: RwLock<HashMap<String, SharedGetObjectBytesFuture>>,
}

impl LakeS3Client {
    pub fn new(s3_client: crate::s3_client::S3Client) -> Self {
        Self {
            s3_client,
            futures_cache: RwLock::new(HashMap::new()),
        }
    }

    pub fn from_conf(config: aws_sdk_s3::config::Config) -> Self {
        let s3_client = crate::s3_client::S3Client::new(config);

        Self::new(s3_client)
    }

    fn get_object_bytes(&self, bucket: &str, prefix: &str) -> GetObjectBytesFuture {
        let s3_client = self.s3_client.clone();
        let bucket = bucket.to_owned();
        let prefix = prefix.to_owned();

        async move {
            metrics::LAKE_S3_GET_REQUEST_COUNT.inc();

            let object = s3_client.get_object(&bucket, &prefix).await?;

            let bytes = object.body.collect().await?.into_bytes().to_vec();

            Ok(bytes)
        }
        .boxed()
    }

    async fn get_object_bytes_cached(&self, bucket: &str, prefix: &str) -> GetObjectBytesResult {
        let existing_future = {
            let read_lock = self.futures_cache.read().await;

            read_lock.get(prefix).cloned()
        };

        let get_object_bytes_future = if let Some(future) = existing_future {
            future
        } else {
            let mut write_lock = self.futures_cache.write().await;

            write_lock
                .entry(prefix.to_string())
                .or_insert_with(|| self.get_object_bytes(bucket, prefix).shared())
                .clone()
        };

        let get_object_bytes_result = get_object_bytes_future.await;

        if get_object_bytes_result.is_err() {
            let mut write_lock = self.futures_cache.write().await;

            write_lock.remove(prefix);
        }

        get_object_bytes_result
    }

    async fn list_common_prefixes(
        &self,
        bucket: &str,
        start_after_prefix: &str,
    ) -> ListCommonPrefixesResult {
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
        ) -> GetObjectBytesResult;

        async fn list_common_prefixes(
            &self,
            bucket: &str,
            start_after_prefix: &str,
        ) -> ListCommonPrefixesResult;
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
