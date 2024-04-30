#![cfg_attr(test, allow(dead_code))]

use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;
use futures::future::Shared;
use futures::{Future, FutureExt};
use near_lake_framework::s3_client::{GetObjectBytesError, ListCommonPrefixesError};
use std::collections::HashMap;
use tokio::sync::Mutex;
// use std::sync::Mutex;

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
        metrics::PROFILE
            .with_label_values(&["get_object_bytes"])
            .observe_closure_duration(|| async {
                self.inner.get_object_bytes_cached(bucket, prefix).await
            })
            .await
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
    shards: Vec<Mutex<HashMap<String, SharedGetObjectBytesFuture>>>,
    shard_count: usize,
}

impl FuturesCache {
    fn new() -> Self {
        let shard_count = 2000;
        let mut shards = Vec::with_capacity(shard_count);

        for _ in 0..shard_count {
            shards.push(Mutex::new(HashMap::new()));
        }

        Self {
            shards,
            shard_count,
        }
    }

    async fn lock_shard(
        &self,
        key: &str,
    ) -> tokio::sync::MutexGuard<'_, HashMap<String, SharedGetObjectBytesFuture>> {
        metrics::PROFILE
            .with_label_values(&["lock_shard"])
            .observe_closure_duration(|| async {
                let shard_index = self.determine_shard(key);
                self.shards[shard_index].lock().await
            })
            .await
    }

    async fn get_or_set_with(
        &self,
        key: String,
        f: impl FnOnce() -> SharedGetObjectBytesFuture,
    ) -> SharedGetObjectBytesFuture {
        let mut shard = self.lock_shard(&key).await;
        shard.entry(key).or_insert_with(f).clone()
    }

    async fn remove(&self, key: &str) {
        let mut shard = self.lock_shard(key).await;
        shard.remove(key);
    }

    /// Determines the shard index based on the last digits of the key
    fn determine_shard(&self, key: &str) -> usize {
        let shard_part: usize =
            key.split('/').next().unwrap().parse::<usize>().unwrap() % self.shard_count;

        shard_part
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
            futures_cache: FuturesCache::new(),
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
            metrics::PROFILE
                .with_label_values(&["get_object_bytes_shared"])
                .observe_closure_duration(|| async {
                    metrics::LAKE_S3_GET_REQUEST_COUNT.inc();

                    let object = s3_client.get_object(&bucket, &prefix).await?;

                    let bytes = object.body.collect().await?.into_bytes().to_vec();

                    Ok(bytes)
                })
                .await
        }
        .boxed()
        .shared()
    }

    async fn get_object_bytes_cached(&self, bucket: &str, prefix: &str) -> GetObjectBytesResult {
        metrics::PROFILE
            .with_label_values(&["get_object_bytes_cached"])
            .observe_closure_duration(|| async {
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
            })
            .await
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

    use aws_sdk_s3::operation::get_object::GetObjectOutput;
    use near_lake_framework::s3_client::S3Client;

    use std::time::Instant;
    use tracing_subscriber::prelude::*;
    use tracing_timing::{Builder, Histogram};

    #[ignore]
    #[tokio::test]
    async fn deduplicates_parallel_requests() {
        // console_subscriber::init();

        let fmt_layer = tracing_subscriber::fmt::layer().compact().with_span_events(
            tracing_subscriber::fmt::format::FmtSpan::EXIT
                | tracing_subscriber::fmt::format::FmtSpan::ENTER,
        );

        // Set up the timing layer
        let timing_layer =
            Builder::default().layer(|| Histogram::<u64>::new_with_max(10_000_000, 2).unwrap());

        // Combine the layers
        let subscriber = tracing_subscriber::registry()
            .with(tracing_subscriber::EnvFilter::from_default_env())
            .with(fmt_layer)
            .with(timing_layer);

        // Initialize the subscriber
        tracing::subscriber::set_global_default(subscriber)
            .expect("setting default subscriber failed");

        tracing::info!("deduplicates_parallel_requests");

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

        use tracing::*;
        use tracing_timing::{Builder, Histogram};

        let subscriber =
            Builder::default().build(|| Histogram::new_with_max(1_000_000, 2).unwrap());
        let sid = subscriber.downcaster();

        use tracing::Dispatch;

        let dispatcher = Dispatch::new(subscriber);
        let d2 = dispatcher.clone();

        let thread_count = 1;
        let barrier = Arc::new(Barrier::new(thread_count));
        let handles: Vec<_> = (0..thread_count)
            .map(|_| {
                let client = shared_lake_s3_client.clone();
                let d2 = dispatcher.clone();

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();

                    dispatcher::with_default(&d2, || {
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
                                if block_height == start_block_height + 9 {
                                    break;
                                }
                                eprintln!("block_height = {:#?}", block_height);
                            }

                            drop(sender);
                        })
                    });
                })
            })
            .collect();

        for handle in handles {
            let _ = handle.join();
        }

        fn break_once<I, F>(it: I, mut f: F) -> impl Iterator<Item = I::Item>
        where
            I: IntoIterator,
            F: FnMut(&I::Item) -> bool,
        {
            let mut got_true = false;
            it.into_iter().take_while(move |i| {
                if got_true {
                    // we've already yielded when f was true
                    return false;
                }
                if f(i) {
                    // this must be the first time f returns true
                    // we should yield i, and then no more
                    got_true = true;
                }
                // f returned false, so we should keep yielding
                true
            })
        }

        sid.downcast(&dispatcher).unwrap().with_histograms(|hs| {
            assert_eq!(hs.len(), 1);
            println!("{:?}", hs.keys());

            let hs = &mut hs.get_mut("request").unwrap();
            assert_eq!(hs.len(), 2);

            hs.get_mut("fast").unwrap().refresh();
            hs.get_mut("slow").unwrap().refresh();

            println!("fast:");
            let h = &hs["fast"];
            println!(
                "mean: {:.1}µs, p50: {}µs, p90: {}µs, p99: {}µs, p999: {}µs, max: {}µs",
                h.mean() / 1000.0,
                h.value_at_quantile(0.5) / 1_000,
                h.value_at_quantile(0.9) / 1_000,
                h.value_at_quantile(0.99) / 1_000,
                h.value_at_quantile(0.999) / 1_000,
                h.max() / 1_000,
            );
            for v in break_once(
                h.iter_linear(25_000).skip_while(|v| v.quantile() < 0.01),
                |v| v.quantile() > 0.95,
            ) {
                println!(
                    "{:4}µs | {:40} | {:4.1}th %-ile",
                    (v.value_iterated_to() + 1) / 1_000,
                    "*".repeat(
                        (v.count_since_last_iteration() as f64 * 40.0 / h.len() as f64).ceil()
                            as usize
                    ),
                    v.percentile(),
                );
            }

            println!("\nslow:");
            let h = &hs["slow"];
            println!(
                "mean: {:.1}µs, p50: {}µs, p90: {}µs, p99: {}µs, p999: {}µs, max: {}µs",
                h.mean() / 1000.0,
                h.value_at_quantile(0.5) / 1_000,
                h.value_at_quantile(0.9) / 1_000,
                h.value_at_quantile(0.99) / 1_000,
                h.value_at_quantile(0.999) / 1_000,
                h.max() / 1_000,
            );
            for v in break_once(
                h.iter_linear(25_000).skip_while(|v| v.quantile() < 0.01),
                |v| v.quantile() > 0.95,
            ) {
                println!(
                    "{:4}µs | {:40} | {:4.1}th %-ile",
                    (v.value_iterated_to() + 1) / 1_000,
                    "*".repeat(
                        (v.count_since_last_iteration() as f64 * 40.0 / h.len() as f64).ceil()
                            as usize
                    ),
                    v.percentile(),
                );
            }
        });

        // for shard in shared_lake_s3_client.inner.futures_cache.shards.iter() {
        //     let lock = shard.lock().await;
        //     eprintln!("lock.len() = {:#?}", lock.keys());
        // }

        assert_eq!(s3_get_call_count.load(Ordering::SeqCst), 1);
    }

    // #[ignore]
    #[tokio::test]
    async fn temp() {
        tracing_subscriber::registry()
            .with(tracing_subscriber::EnvFilter::from_default_env())
            .with(
                tracing_subscriber::fmt::layer()
                    .with_span_events(
                        tracing_subscriber::fmt::format::FmtSpan::ENTER
                            | tracing_subscriber::fmt::format::FmtSpan::EXIT,
                    )
                    .compact(),
            )
            .init();

        let aws_config = aws_config::from_env().load().await;
        let s3_config = aws_sdk_s3::Config::from(&aws_config);
        let s3_client = crate::s3_client::S3ClientImpl::new(s3_config);

        let shared_lake_s3_client = SharedLakeS3ClientImpl::new(LakeS3Client::new(s3_client));

        let thread_count = 1;

        let barrier = Arc::new(Barrier::new(thread_count));
        let handles: Vec<_> = (0..thread_count)
            .map(|_| {
                let client = shared_lake_s3_client.clone();
                let barrier_clone = barrier.clone();

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();

                    rt.block_on(async {
                        let handles: Vec<_> = (117500034..117510134)
                            .map(|height| {
                                let client = client.clone();

                                async move {
                                    client
                                        .get_object_bytes(
                                            "near-lake-data-mainnet",
                                            &format!("{:0>12}/block.json", height),
                                        )
                                        .await
                                        .ok();
                                }
                            })
                            .collect();

                        barrier_clone.wait();

                        futures::future::join_all(handles).await;
                    })
                })
            })
            .collect();

        println!("{:?}", handles);

        for handle in handles {
            let _ = handle.join();
        }

        // for shard in shared_lake_s3_client.inner.futures_cache.shards.iter() {
        //     let lock = shard.lock().await;
        //     eprintln!("lock.len() = {:#?}", lock.len());
        // }
    }
}
