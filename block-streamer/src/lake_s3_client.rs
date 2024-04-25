#![cfg_attr(test, allow(dead_code))]

use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;
use cached::{Cached, SizedCache};
use futures::future::Shared;
use futures::{Future, FutureExt};
use near_lake_framework::s3_client::{GetObjectBytesError, ListCommonPrefixesError};
use tokio::sync::Mutex;

use crate::metrics;

/// Number of files added to Near Lake S3 per hour
const CACHE_SIZE: usize = 18_000;

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
    #[cfg(test)]
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
struct FuturesCache {
    cache: Mutex<SizedCache<String, SharedGetObjectBytesFuture>>,
}

impl FuturesCache {
    pub fn with_size(size: usize) -> Self {
        Self {
            cache: Mutex::new(SizedCache::with_size(size)),
        }
    }

    async fn lock(
        &self,
    ) -> tokio::sync::MutexGuard<'_, SizedCache<String, SharedGetObjectBytesFuture>> {
        let timer = metrics::LAKE_CACHE_LOCK_WAIT_SECONDS.start_timer();

        let lock = self.cache.lock().await;

        metrics::LAKE_CACHE_SIZE.set(lock.cache_size() as i64);
        metrics::LAKE_CACHE_HITS.set(lock.cache_hits().unwrap_or(0) as i64);
        metrics::LAKE_CACHE_MISSES.set(lock.cache_misses().unwrap_or(0) as i64);

        let duration = timer.stop_and_record();
        eprintln!("duration = {:#?}", duration);
        // eprintln!("lock.cache_hits() = {:#?}", lock.cache_hits());
        // eprintln!("lock.cache_misses() = {:#?}", lock.cache_misses());

        lock
    }

    #[cfg(test)]
    pub async fn get(&self, key: &str) -> Option<SharedGetObjectBytesFuture> {
        self.lock().await.cache_get(key).cloned()
    }

    pub async fn get_or_set_with(
        &self,
        key: String,
        f: impl FnOnce() -> SharedGetObjectBytesFuture,
    ) -> SharedGetObjectBytesFuture {
        self.lock().await.cache_get_or_set_with(key, f).clone()
    }

    pub async fn remove(&self, key: &str) {
        self.lock().await.cache_remove(key);
    }
}

#[derive(Debug)]
pub struct LakeS3Client {
    s3_client: crate::s3_client::S3ClientImpl,
    futures_cache: FuturesCache,
}

impl LakeS3Client {
    pub fn new(s3_client: crate::s3_client::S3ClientImpl) -> Self {
        Self {
            s3_client,
            futures_cache: FuturesCache::with_size(CACHE_SIZE),
        }
    }

    pub fn from_conf(config: aws_sdk_s3::config::Config) -> Self {
        let s3_client = crate::s3_client::S3ClientImpl::new(config);

        Self::new(s3_client)
    }

    fn get_object_bytes_shared(&self, bucket: &str, prefix: &str) -> SharedGetObjectBytesFuture {
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
        .shared()
    }

    async fn get_object_bytes_cached(&self, bucket: &str, prefix: &str) -> GetObjectBytesResult {
        let get_object_bytes_future = self
            .futures_cache
            .get_or_set_with(prefix.to_string(), || {
                self.get_object_bytes_shared(bucket, prefix)
            })
            .await;

        let get_object_bytes_result = get_object_bytes_future.await;

        if get_object_bytes_result.is_err() {
            self.futures_cache.remove(prefix).await;
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
            .list_objects_after(bucket, start_after_prefix)
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

        let aws_config = aws_config::from_env().load().await;
        let s3_config = aws_sdk_s3::Config::from(&aws_config);
        let s3_client = crate::s3_client::S3ClientImpl::new(s3_config);

        let shared_lake_s3_client = SharedLakeS3ClientImpl::new(LakeS3Client::new(s3_client));

        let barrier = Arc::new(Barrier::new(100));
        let handles: Vec<_> = (0..100)
            .map(|_| {
                let client = shared_lake_s3_client.clone();

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();

                    rt.block_on(async {
                        let start_block_height = 117500034;
                        let lake_config = near_lake_framework::LakeConfigBuilder::default()
                            .mainnet()
                            .s3_client(client)
                            .start_block_height(start_block_height)
                            .blocks_preload_pool_size(10)
                            .build()
                            .unwrap();

                        let (sender, mut stream) = near_lake_framework::streamer(lake_config);

                        while let Some(streamer_message) = stream.recv().await {
                            let block_height = streamer_message.block.header.height;
                            if block_height == start_block_height + 100 {
                                break;
                            }
                            eprintln!("block_height = {:#?}", block_height);
                        }

                        drop(sender);
                    })
                })
            })
            .collect();

        for handle in handles {
            let _ = handle.join();
        }

        assert_eq!(s3_get_call_count.load(Ordering::SeqCst), 1);
    }
}
