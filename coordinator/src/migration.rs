use std::collections::HashMap;

use anyhow::Context;
use near_primitives::types::AccountId;
use redis::{ErrorKind, RedisError};

use crate::executors_handler::ExecutorsHandler;
use crate::redis::RedisClient;
use crate::registry::{IndexerConfig, IndexerRegistry};

#[derive(serde::Deserialize, serde::Serialize, Debug)]
pub struct AllowlistEntry {
    account_id: AccountId,
    v1_ack: bool,
    migrated: bool,
    failed: bool,
    v2_control: bool,
}

pub type Allowlist = Vec<AllowlistEntry>;

pub async fn fetch_allowlist(redis_client: &RedisClient) -> anyhow::Result<Allowlist> {
    let raw_allowlist: String = redis_client
        .get(RedisClient::ALLOWLIST)
        .await?
        .ok_or(anyhow::anyhow!("Allowlist doesn't exist"))?;

    serde_json::from_str(&raw_allowlist).context("Failed to parse allowlist")
}

pub async fn filter_registry_by_allowlist(
    indexer_registry: IndexerRegistry,
    allowlist: &Allowlist,
) -> anyhow::Result<IndexerRegistry> {
    let filtered_registry: IndexerRegistry = indexer_registry
        .into_iter()
        .filter(|(account_id, _)| {
            allowlist.iter().any(|entry| {
                entry.account_id == *account_id
                    && entry.v1_ack
                    && entry.migrated
                    && !entry.failed
                    && entry.v2_control
            })
        })
        .collect();

    tracing::debug!(
        "Accounts in filtered registry: {:#?}",
        filtered_registry.keys()
    );

    Ok(filtered_registry)
}

pub async fn migrate_pending_accounts(
    indexer_registry: &IndexerRegistry,
    allowlist: &Allowlist,
    redis_client: &RedisClient,
    executors_handler: &ExecutorsHandler,
) -> anyhow::Result<()> {
    for entry in allowlist
        .iter()
        .filter(|entry| !entry.migrated && entry.v1_ack && !entry.failed)
    {
        let indexers = indexer_registry.get(&entry.account_id);

        if indexers.is_none() {
            tracing::warn!(
                "Allowlist entry for account {} not in registry",
                entry.account_id
            );

            continue;
        }

        let _ = migrate_account(
            redis_client,
            executors_handler,
            &entry.account_id,
            indexers.unwrap(),
        )
        .await
        .or_else(|err| {
            tracing::error!("Failed to migrate {}: {:?}", entry.account_id, err);

            set_failed_flag(redis_client, &entry.account_id)
        });
    }

    Ok(())
}

async fn migrate_account(
    redis_client: &RedisClient,
    executors_handler: &ExecutorsHandler,
    account_id: &AccountId,
    indexers: &HashMap<String, IndexerConfig>,
) -> anyhow::Result<()> {
    tracing::info!("Migrating account {}", account_id);

    for (_, indexer_config) in indexers.iter() {
        tracing::info!("Migrating {}", indexer_config.get_full_name());

        let existing_streams = remove_from_streams_set(redis_client, indexer_config)
            .await
            .context("Failed to remove from streams set")?;
        stop_v1_executors(executors_handler, &existing_streams)
            .await
            .context("Failed to stop executors")?;
        merge_streams(redis_client, &existing_streams, indexer_config)
            .await
            .context("Failed to merge streams")?;
    }

    set_migrated_flag(redis_client, account_id)?;

    tracing::info!("Finished migrating {}", account_id);

    Ok(())
}

async fn remove_from_streams_set(
    redis_client: &RedisClient,
    indexer_config: &IndexerConfig,
) -> anyhow::Result<Vec<String>> {
    let mut result = vec![];

    if redis_client
        .srem(
            RedisClient::STREAMS_SET,
            indexer_config.get_historical_redis_stream(),
        )
        .await?
        .is_some()
        && redis_client
            .exists(indexer_config.get_historical_redis_stream())
            .await?
    {
        result.push(indexer_config.get_historical_redis_stream());
    }

    if redis_client
        .srem(
            RedisClient::STREAMS_SET,
            indexer_config.get_real_time_redis_stream(),
        )
        .await?
        .is_some()
        && redis_client
            .exists(indexer_config.get_real_time_redis_stream())
            .await?
    {
        result.push(indexer_config.get_real_time_redis_stream());
    };

    Ok(result)
}

async fn stop_v1_executors(
    executors_handler: &ExecutorsHandler,
    existing_streams: &Vec<String>,
) -> anyhow::Result<()> {
    for stream in existing_streams {
        executors_handler.stop(stream.to_owned()).await?;
    }

    Ok(())
}

async fn merge_streams(
    redis_client: &RedisClient,
    existing_streams: &Vec<String>,
    indexer_config: &IndexerConfig,
) -> anyhow::Result<()> {
    match existing_streams.len() {
        0 => Ok(()),
        1 => {
            redis_client
                .rename(
                    existing_streams[0].to_owned(),
                    indexer_config.get_redis_stream(),
                )
                .await?;

            Ok(())
        }
        2 => {
            let historical_stream = existing_streams[0].to_owned();
            let real_time_stream = existing_streams[1].to_owned();

            redis_client
                .rename(historical_stream, indexer_config.get_redis_stream())
                .await?;

            loop {
                let stream_ids = redis_client.xread(real_time_stream.clone(), 0, 100).await?;

                if stream_ids.is_empty() {
                    break;
                }

                for stream_id in stream_ids {
                    let fields: Vec<(_, _)> = stream_id
                        .map
                        .into_iter()
                        .filter_map(|field| {
                            if let ::redis::Value::Data(data) = field.1 {
                                return Some((field.0, String::from_utf8(data).unwrap()));
                            }

                            tracing::warn!("Ignoring unexpected value in stream: {:?}", field.1);

                            None
                        })
                        .collect();

                    redis_client
                        .xadd(indexer_config.get_redis_stream(), &fields)
                        .await?;
                    redis_client
                        .xdel(indexer_config.get_real_time_redis_stream(), stream_id.id)
                        .await?
                }
            }

            Ok(())
        }
        _ => anyhow::bail!("Unexpected number of pre-existing streams"),
    }
}

fn set_failed_flag(redis_client: &RedisClient, account_id: &AccountId) -> anyhow::Result<()> {
    let account_id = account_id.to_owned();

    redis_client.atomic_update(RedisClient::ALLOWLIST, move |raw_allowlist: String| {
        let mut allowlist: Allowlist = serde_json::from_str(&raw_allowlist).map_err(|_| {
            RedisError::from((ErrorKind::TypeError, "failed to deserialize allowlist"))
        })?;

        let entry = allowlist
            .iter_mut()
            .find(|entry| entry.account_id == account_id)
            .unwrap();

        entry.failed = true;

        serde_json::to_string(&allowlist)
            .map_err(|_| RedisError::from((ErrorKind::TypeError, "failed to serialize allowlist")))
    })?;

    Ok(())
}

fn set_migrated_flag(redis_client: &RedisClient, account_id: &AccountId) -> anyhow::Result<()> {
    let account_id = account_id.to_owned();

    redis_client.atomic_update(RedisClient::ALLOWLIST, move |raw_allowlist: String| {
        let mut allowlist: Allowlist = serde_json::from_str(&raw_allowlist).map_err(|_| {
            RedisError::from((ErrorKind::TypeError, "failed to deserialize allowlist"))
        })?;

        let entry = allowlist
            .iter_mut()
            .find(|entry| entry.account_id == account_id)
            .unwrap();

        entry.migrated = true;

        serde_json::to_string(&allowlist)
            .map_err(|_| RedisError::from((ErrorKind::TypeError, "failed to serialize allowlist")))
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::HashMap;

    use mockall::predicate;
    use registry_types::{Rule, StartBlock, Status};

    use crate::registry::IndexerConfig;

    #[tokio::test]
    async fn ignores_migrated_indexers() {
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([(
                "test".to_string(),
                IndexerConfig {
                    account_id: "morgs.near".parse().unwrap(),
                    function_name: "test".to_string(),
                    code: String::new(),
                    schema: String::new(),
                    rule: Rule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    },
                    created_at_block_height: 101,
                    updated_at_block_height: Some(200),
                    start_block: StartBlock::Height(1000),
                },
            )]),
        )]);

        let allowlist = vec![AllowlistEntry {
            account_id: "morgs.near".parse().unwrap(),
            v1_ack: true,
            migrated: true,
            failed: false,
            v2_control: false,
        }];

        let redis_client = RedisClient::default();
        let executors_handler = ExecutorsHandler::default();

        migrate_pending_accounts(
            &indexer_registry,
            &allowlist,
            &redis_client,
            &executors_handler,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn ignores_indexers_not_in_regsitry() {
        let indexer_registry = HashMap::from([]);

        let allowlist = vec![AllowlistEntry {
            account_id: "morgs.near".parse().unwrap(),
            v1_ack: true,
            migrated: true,
            failed: false,
            v2_control: false,
        }];

        let redis_client = RedisClient::default();
        let executors_handler = ExecutorsHandler::default();

        migrate_pending_accounts(
            &indexer_registry,
            &allowlist,
            &redis_client,
            &executors_handler,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn migrates_indexers_to_control_plane() {
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([(
                "test".to_string(),
                IndexerConfig {
                    account_id: "morgs.near".parse().unwrap(),
                    function_name: "test".to_string(),
                    code: String::new(),
                    schema: String::new(),
                    rule: Rule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    },
                    created_at_block_height: 101,
                    updated_at_block_height: Some(200),
                    start_block: StartBlock::Height(1000),
                },
            )]),
        )]);

        let allowlist = vec![AllowlistEntry {
            account_id: "morgs.near".parse().unwrap(),
            v1_ack: true,
            migrated: false,
            failed: false,
            v2_control: false,
        }];

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_srem::<&str, String>()
            .with(
                predicate::eq("streams"),
                predicate::eq(String::from("morgs.near/test:historical:stream")),
            )
            .returning(|_, _| Ok(Some(())))
            .once();
        redis_client
            .expect_srem::<&str, String>()
            .with(
                predicate::eq("streams"),
                predicate::eq(String::from("morgs.near/test:real_time:stream")),
            )
            .returning(|_, _| Ok(Some(())))
            .once();
        redis_client
            .expect_exists::<String>()
            .with(predicate::eq(String::from(
                "morgs.near/test:historical:stream",
            )))
            .returning(|_| Ok(true))
            .once();
        redis_client
            .expect_exists::<String>()
            .with(predicate::eq(String::from(
                "morgs.near/test:real_time:stream",
            )))
            .returning(|_| Ok(true))
            .once();
        redis_client
            .expect_rename::<String, String>()
            .with(
                predicate::eq(String::from("morgs.near/test:historical:stream")),
                predicate::eq(String::from("morgs.near/test:block_stream")),
            )
            .returning(|_, _| Ok(()))
            .once();
        redis_client
            .expect_xread::<String, i32>()
            .with(
                predicate::eq(String::from("morgs.near/test:real_time:stream")),
                predicate::eq(0),
                predicate::eq(100),
            )
            .returning(|_, _, _| {
                Ok(vec![::redis::streams::StreamId {
                    id: String::from("1-0"),
                    map: HashMap::from([(
                        String::from("block_height"),
                        ::redis::Value::Data(b"123".to_vec()),
                    )]),
                }])
            })
            .once();
        redis_client
            .expect_xread::<String, i32>()
            .with(
                predicate::eq(String::from("morgs.near/test:real_time:stream")),
                predicate::eq(0),
                predicate::eq(100),
            )
            .returning(|_, _, _| Ok(vec![]))
            .once();
        redis_client
            .expect_xadd::<String, String>()
            .with(
                predicate::eq(String::from("morgs.near/test:block_stream")),
                predicate::eq([(String::from("block_height"), String::from("123"))]),
            )
            .returning(|_, _| Ok(()))
            .once();
        redis_client
            .expect_xdel::<String, String>()
            .with(
                predicate::eq(String::from("morgs.near/test:real_time:stream")),
                predicate::eq(String::from("1-0")),
            )
            .returning(|_, _| Ok(()))
            .once();
        redis_client
            .expect_atomic_update::<&str, String, String>()
            .returning(|_, _| Ok(()));

        let mut executors_handler = ExecutorsHandler::default();
        executors_handler
            .expect_stop()
            .with(predicate::eq(String::from(
                "morgs.near/test:historical:stream",
            )))
            .returning(|_| Ok(()))
            .once();
        executors_handler
            .expect_stop()
            .with(predicate::eq(String::from(
                "morgs.near/test:real_time:stream",
            )))
            .returning(|_| Ok(()))
            .once();

        migrate_pending_accounts(
            &indexer_registry,
            &allowlist,
            &redis_client,
            &executors_handler,
        )
        .await
        .unwrap();
    }
}
