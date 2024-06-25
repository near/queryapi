#![cfg_attr(test, allow(dead_code))]

use std::fmt::Debug;

use anyhow::Context;
use redis::{aio::ConnectionManager, AsyncCommands, RedisError, ToRedisArgs};

use crate::indexer_config::IndexerConfig;
use crate::metrics;
use crate::utils;

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

    pub async fn xlen<T>(&self, stream_key: T) -> anyhow::Result<Option<u64>>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("XLEN: {:?}", stream_key);

        let mut cmd = redis::cmd("XLEN");
        cmd.arg(&stream_key);

        let stream_length = cmd
            .query_async(&mut self.connection.clone())
            .await
            .context(format!("XLEN {stream_key:?}"))?;

        Ok(stream_length)
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

    pub async fn set_ex<T, U>(&self, key: T, value: U, expiry: usize) -> Result<(), RedisError>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SET: {:?}, {:?}", key, value);

        self.connection.clone().set_ex(key, value, expiry).await?;

        Ok(())
    }
}

#[cfg(test)]
pub use MockRedisWrapperImpl as RedisWrapper;
#[cfg(not(test))]
pub use RedisWrapperImpl as RedisWrapper;

pub struct RedisWrapperImpl {
    client: RedisClient,
}

#[cfg_attr(test, mockall::automock)]
impl RedisWrapperImpl {
    const STREAMER_MESSAGE_PREFIX: &'static str = "streamer_message:";

    pub async fn connect(redis_url: &str) -> Result<Self, RedisError> {
        let client = RedisClient::connect(redis_url).await?;

        Ok(Self { client })
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

        self.client
            .set(indexer_config.last_processed_block_key(), height)
            .await
            .context("Failed to set last processed block")
    }

    pub async fn get_stream_length(&self, stream: String) -> anyhow::Result<Option<u64>> {
        self.client.xlen(stream).await
    }

    pub async fn cache_streamer_message(
        &self,
        streamer_message: &near_lake_framework::near_indexer_primitives::StreamerMessage,
    ) -> anyhow::Result<()> {
        let height = streamer_message.block.header.height;

        let mut streamer_message = serde_json::to_value(streamer_message)?;

        utils::snake_to_camel(&mut streamer_message);

        self.client
            .set_ex(
                format!("{}{}", Self::STREAMER_MESSAGE_PREFIX, height),
                serde_json::to_string(&streamer_message)?,
                60,
            )
            .await
            .context("Failed to cache streamer message")
    }

    pub async fn publish_block(
        &self,
        indexer: &IndexerConfig,
        stream: String,
        block_height: u64,
        max_size: u64,
    ) -> anyhow::Result<()> {
        loop {
            let stream_length = self.get_stream_length(stream.clone()).await?;

            if stream_length.is_none() {
                break;
            }

            if stream_length.unwrap() < max_size {
                break;
            }

            println!("Waiting for stream to be consumed");
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        metrics::PUBLISHED_BLOCKS_COUNT
            .with_label_values(&[&indexer.get_full_name()])
            .inc();

        self.client
            .xadd(
                stream.clone(),
                &[(String::from("block_height"), block_height)],
            )
            .await
            .context("Failed to add block to Redis Stream")
    }
}

#[cfg(test)]
mod test {
    use super::*;

    use mockall::predicate;
    use near_lake_framework::near_indexer_primitives;

    #[tokio::test]
    async fn limits_block_stream_length() {
        let mut mock_redis_client = RedisClient::default();
        mock_redis_client
            .expect_xadd::<String, u64>()
            .with(predicate::eq("stream".to_string()), predicate::always())
            .returning(|_, _| Ok(()))
            .once();
        let mut stream_len = 10;
        mock_redis_client
            .expect_xlen::<String>()
            .with(predicate::eq("stream".to_string()))
            .returning(move |_| {
                stream_len -= 1;
                Ok(Some(stream_len))
            });

        let redis = RedisWrapperImpl {
            client: mock_redis_client,
        };

        let indexer_config = crate::indexer_config::IndexerConfig {
            account_id: near_indexer_primitives::types::AccountId::try_from(
                "morgs.near".to_string(),
            )
            .unwrap(),
            function_name: "test".to_string(),
            rule: registry_types::Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: registry_types::Status::Success,
            },
        };

        tokio::time::pause();

        redis
            .publish_block(&indexer_config, "stream".to_string(), 0, 1)
            .await
            .unwrap();
    }
}
