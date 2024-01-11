use std::fmt::Debug;

use redis::{aio::ConnectionManager, RedisError, ToRedisArgs};

#[cfg(test)]
pub use MockRedisClientImpl as RedisClient;
#[cfg(not(test))]
pub use RedisClientImpl as RedisClient;

pub struct RedisClientImpl {
    connection: ConnectionManager,
}

#[cfg_attr(test, mockall::automock)]
impl RedisClientImpl {
    pub async fn connect(redis_connection_str: &str) -> Result<Self, RedisError> {
        let connection = redis::Client::open(redis_connection_str)?
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
}
