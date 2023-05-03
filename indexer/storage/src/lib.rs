pub use redis::{self, aio::ConnectionManager, FromRedisValue, ToRedisArgs};

const STORAGE: &str = "storage_alertexer";

pub async fn get_redis_client(redis_connection_str: &str) -> redis::Client {
    redis::Client::open(redis_connection_str).expect("can create redis client")
}

pub async fn connect(redis_connection_str: &str) -> anyhow::Result<ConnectionManager> {
    Ok(get_redis_client(redis_connection_str)
        .await
        .get_tokio_connection_manager()
        .await?)
}

pub async fn del(
    redis_connection_manager: &ConnectionManager,
    key: impl ToRedisArgs + std::fmt::Debug,
) -> anyhow::Result<()> {
    redis::cmd("DEL")
        .arg(&key)
        .query_async(&mut redis_connection_manager.clone())
        .await?;
    tracing::debug!(target: STORAGE, "DEL: {:?}", key);
    Ok(())
}

pub async fn set(
    redis_connection_manager: &ConnectionManager,
    key: impl ToRedisArgs + std::fmt::Debug,
    value: impl ToRedisArgs + std::fmt::Debug,
) -> anyhow::Result<()> {
    redis::cmd("SET")
        .arg(&key)
        .arg(&value)
        .query_async(&mut redis_connection_manager.clone())
        .await?;
    tracing::debug!(target: STORAGE, "SET: {:?}: {:?}", key, value,);
    Ok(())
}

pub async fn get<V: FromRedisValue + std::fmt::Debug>(
    redis_connection_manager: &ConnectionManager,
    key: impl ToRedisArgs + std::fmt::Debug,
) -> anyhow::Result<V> {
    let value: V = redis::cmd("GET")
        .arg(&key)
        .query_async(&mut redis_connection_manager.clone())
        .await?;
    tracing::debug!(target: STORAGE, "GET: {:?}: {:?}", &key, &value,);
    Ok(value)
}

/// Sets the key `receipt_id: &str` with value `transaction_hash: &str` to the Redis storage.
/// Increments the counter `receipts_{transaction_hash}` by one.
/// The counter holds how many Receipts related to the Transaction are in watching list
pub async fn push_receipt_to_watching_list(
    redis_connection_manager: &ConnectionManager,
    receipt_id: &str,
    cache_value: &[u8],
) -> anyhow::Result<()> {
    set(redis_connection_manager, receipt_id, cache_value).await?;
    // redis::cmd("INCR")
    //     .arg(format!("receipts_{}", transaction_hash))
    //     .query_async(&mut redis_connection_manager.clone())
    //     .await?;
    Ok(())
}

/// Removes key `receipt_id: &str` from Redis storage.
/// If the key exists in the storage decreases the `receipts_{transaction_hash}` counter.
// pub async fn remove_receipt_from_watching_list(
//     redis_connection_manager: &ConnectionManager,
//     receipt_id: &str,
// ) -> anyhow::Result<Option<String>> {
//     match get::<Option<String>>(redis_connection_manager, receipt_id).await {
//         Ok(maybe_transaction_hash) => {
//             if let Some(ref transaction_hash) = maybe_transaction_hash {
//                 redis::cmd("DECR")
//                     .arg(format!("receipts_{}", transaction_hash))
//                     .query_async(&mut redis_connection_manager.clone())
//                     .await?;
//                 tracing::debug!(target: STORAGE, "DECR: receipts_{}", transaction_hash);
//                 del(redis_connection_manager, receipt_id).await?;
//             }
//             Ok(maybe_transaction_hash)
//         }
//         Err(e) => {
//             anyhow::bail!(e)
//         }
//     }
// }

/// Returns the value of the `receipts_{transaction_hash}` counter
pub async fn receipts_transaction_hash_count(
    redis_connection_manager: &ConnectionManager,
    transaction_hash: &str,
) -> anyhow::Result<u64> {
    get::<u64>(
        redis_connection_manager,
        format!("receipts_{}", transaction_hash),
    )
    .await
}

pub async fn update_last_indexed_block(
    redis_connection_manager: &ConnectionManager,
    block_height: u64,
) -> anyhow::Result<()> {
    set(redis_connection_manager, "last_indexed_block", block_height).await?;
    redis::cmd("INCR")
        .arg("blocks_processed")
        .query_async(&mut redis_connection_manager.clone())
        .await?;
    Ok(())
}

pub async fn get_last_indexed_block(
    redis_connection_manager: &ConnectionManager,
) -> anyhow::Result<u64> {
    Ok(redis::cmd("GET")
        .arg("last_indexed_block")
        .query_async(&mut redis_connection_manager.clone())
        .await?)
}
