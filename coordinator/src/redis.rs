#![cfg_attr(test, allow(dead_code))]

use std::fmt::Debug;

use anyhow::Context;
use redis::{aio::ConnectionManager, FromRedisValue, ToRedisArgs};

pub trait KeyProvider {
    fn account_id(&self) -> String;
    fn function_name(&self) -> String;

    fn prefix(&self) -> String {
        format!("{}/{}", self.account_id(), self.function_name())
    }

    fn get_redis_stream_key(&self) -> String {
        format!("{}:block_stream", self.prefix())
    }

    fn get_last_published_block_key(&self) -> String {
        format!("{}:last_published_block", self.prefix())
    }

    fn get_state_key(&self) -> String {
        format!("{}:state", self.prefix())
    }
}

#[cfg(test)]
pub use MockRedisClientImpl as RedisClient;
#[cfg(not(test))]
pub use RedisClientImpl as RedisClient;

#[derive(Clone)]
pub struct RedisClientImpl {
    connection: ConnectionManager,
}

impl RedisClientImpl {
    const INDEXER_STATES_SET: &'static str = "indexer_states";

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

        redis::cmd("SET")
            .arg(&key)
            .arg(&value)
            .query_async(&mut self.connection.clone())
            .await
            .context(format!("SET: {key:?} {value:?}"))
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

    pub async fn smembers<S>(&self, set: S) -> anyhow::Result<Vec<String>>
    where
        S: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SMEMBERS {set:?}");

        redis::cmd("SMEMBERS")
            .arg(&set)
            .query_async(&mut self.connection.clone())
            .await
            .context(format!("SMEMBERS {set:?}"))
    }

    pub async fn sadd<S, M>(&self, set: S, member: M) -> anyhow::Result<()>
    where
        S: ToRedisArgs + Debug + Send + Sync + 'static,
        M: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SADD {set:?} {member:?}");

        redis::cmd("SADD")
            .arg(&set)
            .arg(&member)
            .query_async(&mut self.connection.clone())
            .await
            .context(format!("SADD {set:?} {member:?}"))
    }

    pub async fn srem<S, M>(&self, set: S, member: M) -> anyhow::Result<()>
    where
        S: ToRedisArgs + Debug + Send + Sync + 'static,
        M: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("SADD {set:?} {member:?}");

        redis::cmd("SREM")
            .arg(&set)
            .arg(&member)
            .query_async(&mut self.connection.clone())
            .await
            .context(format!("SADD {set:?} {member:?}"))
    }

    pub async fn exists<K>(&self, key: K) -> anyhow::Result<bool>
    where
        K: ToRedisArgs + Debug + Send + Sync + 'static,
    {
        tracing::debug!("EXISTS {key:?}");

        redis::cmd("EXISTS")
            .arg(&key)
            .query_async(&mut self.connection.clone())
            .await
            .context(format!("EXISTS {key:?}"))
    }

    pub async fn indexer_states_set_exists(&self) -> anyhow::Result<bool> {
        self.exists(Self::INDEXER_STATES_SET).await
    }

    pub async fn get_last_published_block<P>(&self, key_provider: &P) -> anyhow::Result<Option<u64>>
    where
        P: KeyProvider + 'static,
    {
        self.get::<_, u64>(key_provider.get_last_published_block_key())
            .await
    }

    pub async fn clear_block_stream<P>(&self, key_provider: &P) -> anyhow::Result<()>
    where
        P: KeyProvider + 'static,
    {
        let stream_key = key_provider.get_redis_stream_key();
        self.del(stream_key.clone())
            .await
            .context(format!("Failed to clear Redis Stream: {}", stream_key))
    }

    pub async fn get_indexer_state<P>(&self, key_provider: &P) -> anyhow::Result<Option<String>>
    where
        P: KeyProvider + 'static,
    {
        self.get(key_provider.get_state_key()).await
    }

    pub async fn set_indexer_state<P>(&self, key_provider: &P, state: String) -> anyhow::Result<()>
    where
        P: KeyProvider + 'static,
    {
        self.set(key_provider.get_state_key(), state).await?;

        self.sadd(Self::INDEXER_STATES_SET, key_provider.get_state_key())
            .await
    }

    pub async fn delete_indexer_state<P>(&self, key_provider: &P) -> anyhow::Result<()>
    where
        P: KeyProvider + 'static,
    {
        self.del(key_provider.get_state_key()).await?;

        self.srem(Self::INDEXER_STATES_SET, key_provider.get_state_key())
            .await
    }

    pub async fn list_indexer_states(&self) -> anyhow::Result<Vec<String>> {
        let mut states = vec![];

        for state_key in self.smembers(Self::INDEXER_STATES_SET).await? {
            let state = self.get(state_key.clone()).await?;

            if state.is_none() {
                anyhow::bail!(
                    "Key: {} from Set: {} set, does not exist",
                    state_key,
                    Self::INDEXER_STATES_SET
                );
            }

            states.push(state.unwrap());
        }

        Ok(states)
    }
}

#[cfg(test)]
mockall::mock! {
    pub RedisClientImpl {
        pub async fn connect(redis_url: &str) -> anyhow::Result<Self>;

        pub async fn get_indexer_state<P>(&self, key_provider: &P) -> anyhow::Result<Option<String>>
            where P: KeyProvider + 'static;

        pub async fn set_indexer_state<P>(
            &self,
            key_provider: &P,
            state: String,
        ) -> anyhow::Result<()>
            where P: KeyProvider + 'static;

        pub async fn get_last_published_block<P>(
            &self,
            key_provider: &P,
        ) -> anyhow::Result<Option<u64>>
            where P: KeyProvider + 'static;

        pub async fn clear_block_stream<P>(&self, key_provider: &P) -> anyhow::Result<()>
            where P: KeyProvider + 'static;

        pub async fn get<T, U>(&self, key: T) -> anyhow::Result<Option<U>>
            where
                T: ToRedisArgs + Debug + Send + Sync + 'static,
                U: FromRedisValue + Debug + 'static;

        pub async fn set<K, V>(&self, key: K, value: V) -> anyhow::Result<()>
            where
                K: ToRedisArgs + Debug + Send + Sync + 'static,
                V: ToRedisArgs + Debug + Send + Sync + 'static;

        pub async fn del<K>(&self, key: K) -> anyhow::Result<()>
        where
            K: ToRedisArgs + Debug + Send + Sync + 'static;

        pub async fn indexer_states_set_exists(&self) -> anyhow::Result<bool>;

        pub async fn sadd<S, V>(&self, set: S, value: V) -> anyhow::Result<()>
            where
                S: ToRedisArgs + Debug + Send + Sync + 'static,
                V: ToRedisArgs + Debug + Send + Sync + 'static;

        pub async fn list_indexer_states(&self) -> anyhow::Result<Vec<String>>;

        pub async fn delete_indexer_state<P>(&self, key_provider: &P) -> anyhow::Result<()>
            where P: KeyProvider + 'static;
    }

    impl Clone for RedisClientImpl {
        fn clone(&self) -> Self;
    }
}
