#![cfg_attr(test, allow(dead_code))]

use std::fmt::Debug;

use anyhow::Context;
use redis::{aio::ConnectionManager, RedisError, ToRedisArgs};

use crate::indexer_config::IndexerConfig;
use crate::metrics;

#[cfg(test)]
pub use MockRedisClientImpl as RedisClient;
#[cfg(not(test))]
pub use RedisClientImpl as RedisClient;

pub struct RedisClientImpl {
    connection: ConnectionManager,
}

#[cfg_attr(test, mockall::automock)]
impl RedisClientImpl {
    pub async fn connect(redis_url: &str) -> Result<Self, RedisError> {
        let connection = redis::Client::open(redis_url)?
            .get_tokio_connection_manager()
            .await?;

        Ok(Self { connection })
    }

    pub async fn xadd<T, U>(&self, stream_key: T, fields: &[(String, U)]) -> Result<(), RedisError>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("XADD: {:?}, {:?}", stream_key, fields);

        let mut cmd = redis::cmd("XADD");
        cmd.arg(stream_key).arg("*");

        for (field, value) in fields {
            cmd.arg(field).arg(value);
        }

        cmd.query_async(&mut self.connection.clone()).await?;

        Ok(())
    }

    pub async fn set<T, U>(&self, key: T, value: U) -> Result<(), RedisError>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SET: {:?}, {:?}", key, value);

        let mut cmd = redis::cmd("SET");
        cmd.arg(key).arg(value);

        cmd.query_async(&mut self.connection.clone()).await?;

        Ok(())
    }

    pub async fn set_last_processed_block(
        &self,
        indexer_config: &IndexerConfig,
        height: u64,
    ) -> anyhow::Result<()> {
        let indexer = indexer_config.get_full_name();
        metrics::PROCESSED_BLOCKS_COUNT
            .with_label_values(&[&indexer])
            .inc();
        metrics::LAST_PROCESSED_BLOCK
            .with_label_values(&[&indexer])
            .set(
                height
                    .try_into()
                    .context("Failed to convert block height (u64) to metrics type (i64)")?,
            );

        self.set(indexer_config.last_processed_block_key(), height)
            .await
            .context("Failed to set last processed block")
    }

    pub async fn publish_block(
        &self,
        indexer: &IndexerConfig,
        stream: String,
        block_height: u64,
    ) -> anyhow::Result<()> {
        metrics::PUBLISHED_BLOCKS_COUNT
            .with_label_values(&[&indexer.get_full_name()])
            .inc();

        self.xadd(
            stream.clone(),
            &[(String::from("block_height"), block_height)],
        )
        .await
        .context("Failed to add block to Redis Stream")
    }
}
