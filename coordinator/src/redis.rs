#![cfg_attr(test, allow(dead_code))]

use std::fmt::Debug;

use anyhow::Context;
use redis::{aio::ConnectionManager, FromRedisValue, ToRedisArgs};

use crate::indexer_config::IndexerConfig;

#[cfg(test)]
pub use MockRedisClientImpl as RedisClient;
#[cfg(not(test))]
pub use RedisClientImpl as RedisClient;

#[derive(Clone)]
pub struct RedisClientImpl {
    connection: ConnectionManager,
}

impl RedisClientImpl {
    pub async fn connect(redis_url: &str) -> anyhow::Result<Self> {
        let connection = redis::Client::open(redis_url)?
            .get_connection_manager()
            .await
            .context("Unable to connect to Redis")?;

        Ok(Self { connection })
    }

    pub async fn get<T, U>(&self, key: T) -> anyhow::Result<Option<U>>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: FromRedisValue + Debug + 'static,
    {
        let mut cmd = redis::cmd("GET");
        cmd.arg(&key);
        let value = cmd
            .query_async(&mut self.connection.clone())
            .await
            .context(format!("GET: {key:?}"))?;

        tracing::debug!("GET: {:?}={:?}", key, &value);

        Ok(value)
    }

    pub async fn set<K, V>(&self, key: K, value: V) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
        V: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SET: {:?}, {:?}", key, value);

        let mut cmd = redis::cmd("SET");
        cmd.arg(key).arg(value);
        cmd.query_async(&mut self.connection.clone()).await?;

        Ok(())
    }

    pub async fn del<K>(&self, key: K) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("DEL {key:?}");

        let mut cmd = redis::cmd("DEL");
        cmd.arg(&key);
        cmd.query_async(&mut self.connection.clone())
            .await
            .context(format!("DEL {key:?}"))?;

        Ok(())
    }

    pub async fn get_last_published_block(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<Option<u64>> {
        self.get::<_, u64>(indexer_config.get_last_published_block_key())
            .await
    }

    pub async fn clear_block_stream(&self, indexer_config: &IndexerConfig) -> anyhow::Result<()> {
        self.del(indexer_config.get_redis_stream_key()).await
    }

    pub async fn get_indexer_state(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<Option<String>> {
        self.get(indexer_config.get_state_key()).await
    }
}

#[cfg(test)]
mockall::mock! {
    pub RedisClientImpl {
        pub async fn connect(redis_url: &str) -> anyhow::Result<Self>;

        pub async fn get_indexer_state(&self, indexer_config: &IndexerConfig) -> anyhow::Result<Option<String>>;

        pub async fn get_last_published_block(
            &self,
            indexer_config: &IndexerConfig,
        ) -> anyhow::Result<Option<u64>>;

        pub async fn clear_block_stream(&self, indexer_config: &IndexerConfig) -> anyhow::Result<()>;
    }

    impl Clone for RedisClientImpl {
        fn clone(&self) -> Self;
    }
}
