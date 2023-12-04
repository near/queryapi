use std::fmt::Debug;

use redis::{aio::ConnectionManager, RedisError, ToRedisArgs};

pub fn generate_historical_stream_key(prefix: &str) -> String {
    format!("{}:historical:stream", prefix)
}

#[mockall::automock]
#[async_trait::async_trait]
pub trait RedisClientTrait: Send + Sync + 'static {
    async fn xadd<T, U>(&self, stream_key: T, fields: &[(String, U)]) -> Result<(), RedisError>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: ToRedisArgs + Debug + Send + Sync + 'static;
}

#[derive(Clone)]
pub struct RedisClient {
    connection: ConnectionManager,
}

impl RedisClient {
    pub async fn connect(redis_connection_str: &str) -> Result<Self, RedisError> {
        let connection = redis::Client::open(redis_connection_str)?
            .get_tokio_connection_manager()
            .await?;

        Ok(Self { connection })
    }
}

#[async_trait::async_trait]
impl RedisClientTrait for RedisClient {
    async fn xadd<T, U>(&self, stream_key: T, fields: &[(String, U)]) -> Result<(), RedisError>
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
}
