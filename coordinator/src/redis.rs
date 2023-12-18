use std::fmt::Debug;

use redis::{aio::ConnectionManager, FromRedisValue, RedisError, ToRedisArgs};

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
            .get_connection_manager()
            .await?;

        Ok(Self { connection })
    }

    pub async fn get<T, U>(&self, key: T) -> Result<U, RedisError>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: FromRedisValue + Send + Sync + 'static,
    {
        tracing::debug!("GET: {:?}", key);

        redis::cmd("GET")
            .arg(key)
            .query_async(&mut self.connection.clone())
            .await
    }
}
