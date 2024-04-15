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
    // TODO use a more efficient cache
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
            let futures_cache = self.futures_cache.read().await;

            futures_cache.get(prefix).cloned()
        };

        let get_object_bytes_future = if let Some(future) = existing_future {
            future
        } else {
            let mut futures_cache = self.futures_cache.write().await;

            futures_cache
                .entry(prefix.to_string())
                .or_insert_with(|| self.get_object_bytes(bucket, prefix).shared())
                .clone()
        };

        let get_object_bytes_result = get_object_bytes_future.await;

        if get_object_bytes_result.is_err() {
            let mut futures_cache = self.futures_cache.write().await;

            futures_cache.remove(prefix);
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

    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Barrier;

    use aws_sdk_s3::error::SdkError;
    use aws_sdk_s3::operation::get_object::GetObjectError;
    use aws_sdk_s3::operation::get_object::GetObjectOutput;
    use aws_sdk_s3::types::error::NoSuchKey;
    use near_lake_framework::s3_client::S3Client;

    #[tokio::test]
    async fn deduplicates_parallel_requests() {
        let s3_get_call_count = Arc::new(AtomicUsize::new(0));

        let call_count_clone = s3_get_call_count.clone();

        let mut mock_s3_client = crate::s3_client::S3Client::default();
        mock_s3_client.expect_clone().returning(move || {
            let call_count_clone = call_count_clone.clone();

            let mut mock_s3_client = crate::s3_client::S3Client::default();
            mock_s3_client.expect_get_object().returning(move |_, _| {
                call_count_clone.fetch_add(1, Ordering::SeqCst);

                Ok(GetObjectOutput::builder().build())
            });

            mock_s3_client
        });

        let shared_lake_s3_client = SharedLakeS3ClientImpl::new(LakeS3Client::new(mock_s3_client));

        let barrier = Arc::new(Barrier::new(10));
        let handles: Vec<_> = (0..10)
            .map(|_| {
                let client = shared_lake_s3_client.clone();
                let barrier_clone = barrier.clone();

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();

                    rt.block_on(async {
                        barrier_clone.wait();
                        client.get_object_bytes("bucket", "prefix").await
                    })
                })
            })
            .collect();

        for handle in handles {
            let _ = handle.join();
        }

        assert_eq!(s3_get_call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn caches_requests() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client.expect_clone().returning(|| {
            let mut mock_s3_client = crate::s3_client::S3Client::default();

            mock_s3_client
                .expect_get_object()
                .returning(|_, _| Ok(GetObjectOutput::builder().build()));

            mock_s3_client
        });

        let shared_lake_s3_client = SharedLakeS3ClientImpl::new(LakeS3Client::new(mock_s3_client));

        let _ = shared_lake_s3_client
            .get_object_bytes("bucket", "prefix")
            .await;

        let futures_cache = shared_lake_s3_client.inner.futures_cache.read().await;
        assert!(futures_cache.get("prefix").is_some());
    }

    #[tokio::test]
    async fn removes_cache_on_error() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client.expect_clone().returning(|| {
            let mut mock_s3_client = crate::s3_client::S3Client::default();

            mock_s3_client.expect_get_object().returning(|_, _| {
                Err(SdkError::construction_failure(GetObjectError::NoSuchKey(
                    NoSuchKey::builder().build(),
                )))
            });

            mock_s3_client
        });

        let shared_lake_s3_client = SharedLakeS3ClientImpl::new(LakeS3Client::new(mock_s3_client));

        let _ = shared_lake_s3_client
            .get_object_bytes("bucket", "prefix")
            .await;

        let futures_cache = shared_lake_s3_client.inner.futures_cache.read().await;

        assert!(futures_cache.get("prefix").is_none());
    }
}
