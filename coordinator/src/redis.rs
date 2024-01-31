#![cfg_attr(test, allow(dead_code))]

use std::fmt::Debug;

use anyhow::Context;
use redis::{aio::ConnectionManager, streams, AsyncCommands, FromRedisValue, ToRedisArgs};

#[cfg(test)]
pub use MockRedisClientImpl as RedisClient;
#[cfg(not(test))]
pub use RedisClientImpl as RedisClient;

pub struct RedisClientImpl {
    connection: ConnectionManager,
}

#[cfg_attr(test, mockall::automock)]
impl RedisClientImpl {
    pub const STREAMS_SET: &str = "streams";

    pub async fn connect(redis_url: &str) -> anyhow::Result<Self> {
        let connection = redis::Client::open(redis_url)?
            .get_connection_manager()
            .await
            .context("Unable to connect to Redis")?;

        Ok(Self { connection })
    }

    pub async fn get<T, U>(&self, key: T) -> anyhow::Result<U>
    where
        T: ToRedisArgs + Debug + 'static,
        U: FromRedisValue + Debug + 'static,
    {
        let value = redis::cmd("GET")
            .arg(&key)
            .query_async(&mut self.connection.clone())
            .await
            .map_err(|e| anyhow::format_err!(e))?;

        tracing::debug!("GET: {:?}={:?}", key, value);

        Ok(value)
    }
    pub async fn srem<T, U>(&self, key: T, value: U) -> anyhow::Result<()>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SREM: {:?}={:?}", key, value);

        self.connection.clone().srem(key, value).await?;

        Ok(())
    }

}
