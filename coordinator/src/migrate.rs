use crate::executors_handler::ExecutorsHandler;
use crate::redis::RedisClient;
use crate::registry::IndexerRegistry;
use crate::Allowlist;

pub async fn migrate_pending_indexers(
    indexer_registry: &IndexerRegistry,
    allowlist: &Allowlist,
    redis_client: &RedisClient,
    executors_handler: &ExecutorsHandler,
) -> anyhow::Result<()> {
    for entry in allowlist.iter().filter(|entry| !entry.migrated) {
        let indexers = indexer_registry.get(&entry.account_id);

        if indexers.is_none() {
            tracing::warn!(
                "Allowlist entry for account {} not in registry",
                entry.account_id
            );

            continue;
        }

        let indexers = indexers.unwrap();

        for (_, indexer_config) in indexers.iter() {
            // TODO should probably check if these exist?
            redis_client
                .srem(
                    RedisClient::STREAMS_SET,
                    indexer_config.get_real_time_redis_stream(),
                )
                .await?;
            redis_client
                .srem(
                    RedisClient::STREAMS_SET,
                    indexer_config.get_historical_redis_stream(),
                )
                .await?;

            executors_handler
                .stop(indexer_config.get_real_time_redis_stream())
                .await?;
            executors_handler
                .stop(indexer_config.get_historical_redis_stream())
                .await?;

            // TODO handle err no such key
            redis_client
                .rename(
                    indexer_config.get_historical_redis_stream(),
                    indexer_config.get_redis_stream(),
                )
                .await?;

            loop {
                let stream_ids = redis_client
                    .xread(indexer_config.get_real_time_redis_stream(), 0, 100)
                    .await?;

                for stream_id in stream_ids {
                    let fields: Vec<(_, _)> = stream_id
                        .map
                        .into_iter()
                        .filter_map(|field| {
                            if let ::redis::Value::Data(data) = field.1 {
                                return Some((field.0, String::from_utf8(data).unwrap()));
                            }

                            // TODO data should always be serializable as string - log some
                            // warning?
                            None
                        })
                        .collect();

                    redis_client
                        .xadd(indexer_config.get_redis_stream(), &fields)
                        .await?;
                }
            }
        }
    }

    Ok(())
}
