#![cfg_attr(test, allow(dead_code))]

use std::fmt::Debug;

use anyhow::Context;
use redis::{
    aio::ConnectionManager, streams, AsyncCommands, FromRedisValue, RedisResult, ToRedisArgs,
};

use crate::indexer_config::IndexerConfig;

#[cfg(test)]
pub use MockRedisClientImpl as RedisClient;
#[cfg(not(test))]
pub use RedisClientImpl as RedisClient;

pub struct RedisClientImpl {
    connection: ConnectionManager,
    url: String,
}

#[cfg_attr(test, mockall::automock)]
impl RedisClientImpl {
    pub const STREAMS_SET: &str = "streams";
    pub const ALLOWLIST: &str = "allowlist";

    pub async fn connect(redis_url: &str) -> anyhow::Result<Self> {
        let connection = redis::Client::open(redis_url)?
            .get_connection_manager()
            .await
            .context("Unable to connect to Redis")?;

        Ok(Self {
            connection,
            url: redis_url.to_string(),
        })
    }

    pub async fn get<T, U>(&self, key: T) -> anyhow::Result<Option<U>>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: FromRedisValue + Debug + 'static,
    {
        let value: Option<U> = self
            .connection
            .clone()
            .get(&key)
            .await
            .context(format!("GET: {key:?}"))?;

        tracing::debug!("GET: {:?}={:?}", key, value);

        Ok(value)
    }
    pub async fn set<K, V>(&self, key: K, value: V) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
        V: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SET: {key:?} {value:?}");

        self.connection
            .clone()
            .set(&key, &value)
            .await
            .context(format!("SET: {key:?} {value:?}"))?;

        Ok(())
    }

    pub async fn rename<K, V>(&self, old_key: K, new_key: V) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
        V: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("RENAME: {:?} -> {:?}", old_key, new_key);

        self.connection
            .clone()
            .rename(&old_key, &new_key)
            .await
            .context(format!("RENAME: {old_key:?} {new_key:?}"))?;

        Ok(())
    }

    pub async fn srem<T, U>(&self, key: T, value: U) -> anyhow::Result<Option<()>>
    where
        T: ToRedisArgs + Debug + Send + Sync + 'static,
        U: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SREM: {:?}={:?}", key, value);

        match self.connection.clone().srem(&key, &value).await {
            Ok(1) => Ok(Some(())),
            Ok(_) => Ok(None),
            Err(e) => Err(anyhow::format_err!(e)),
        }
        .context(format!("SREM: {key:?} {value:?}"))
    }

    pub async fn xread<K, V>(
        &self,
        key: K,
        start_id: V,
        count: usize,
    ) -> anyhow::Result<Vec<streams::StreamId>>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
        V: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("XREAD: {:?} {:?} {:?}", key, start_id, count);

        let mut results: streams::StreamReadReply = self
            .connection
            .clone()
            .xread_options(
                &[&key],
                &[&start_id],
                &streams::StreamReadOptions::default().count(count),
            )
            .await
            .context(format!("XREAD {key:?} {start_id:?} {count:?}"))?;

        if results.keys.is_empty() {
            return Ok([].to_vec());
        }

        Ok(results.keys.remove(0).ids)
    }

    pub async fn xadd<K, U>(&self, key: K, fields: &[(String, U)]) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
        U: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("XADD: {:?} {:?} {:?}", key, "*", fields);

        self.connection
            .clone()
            .xadd(&key, "*", fields)
            .await
            .context(format!("XADD {key:?} {fields:?}"))?;

        Ok(())
    }

    pub async fn xdel<K, I>(&self, key: K, id: I) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
        I: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("XDEL: {:?} {:?}", key, id);

        self.connection
            .clone()
            .xdel(&key, &[&id])
            .await
            .context(format!("XDEL {key:?} {id:?}"))?;

        Ok(())
    }

    pub async fn exists<K>(&self, key: K) -> anyhow::Result<bool>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("EXISTS {key:?}");

        self.connection
            .clone()
            .exists(&key)
            .await
            .map_err(|e| anyhow::format_err!(e))
            .context(format!("EXISTS {key:?}"))
    }

    pub async fn del<K>(&self, key: K) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("DEL {key:?}");

        self.connection
            .clone()
            .keys(&key)
            .await
            .map_err(|e| anyhow::format_err!(e))
            .context(format!("DEL {key:?}"))
    }

    // `redis::transaction`s currently don't work with async connections, so we have to create a _new_
    // blocking connection to atmoically update a value.
    pub fn atomic_update<K, O, N, F>(&self, key: K, update_fn: F) -> anyhow::Result<()>
    where
        K: ToRedisArgs + Copy + 'static,
        O: FromRedisValue + 'static,
        N: ToRedisArgs + 'static,
        F: Fn(O) -> RedisResult<N> + 'static,
    {
        let mut conn = redis::Client::open(self.url.clone())?.get_connection()?;

        redis::transaction(&mut conn, &[key], |conn, pipe| {
            let old_value = redis::cmd("GET").arg(key).query(conn)?;
            let new_value = update_fn(old_value)?;

            pipe.cmd("SET").arg(key).arg(new_value).query(conn)
        })?;

        Ok(())
    }

    pub async fn get_stream_version(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<Option<u64>> {
        self.get::<_, u64>(indexer_config.get_redis_stream_version_key())
            .await
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

    pub async fn set_stream_version(
        &self,
        indexer_config: &IndexerConfig,
        version: u64,
    ) -> anyhow::Result<()> {
        self.set(indexer_config.get_redis_stream_version_key(), version)
            .await
    }
}
