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

                            // TODO data should always be serializable as string - log some
                            // warning?
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
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::HashMap;

    use mockall::predicate;
    use registry_types::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

    use crate::registry::IndexerConfig;
    use crate::AllowlistEntry;

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
                    schema: Some(String::new()),
                    filter: IndexerRule {
                        id: None,
                        name: None,
                        indexer_rule_kind: IndexerRuleKind::Action,
                        matching_rule: MatchingRule::ActionAny {
                            affected_account_id: "queryapi.dataplatform.near".to_string(),
                            status: Status::Any,
                        },
                    },
                    created_at_block_height: 101,
                    updated_at_block_height: Some(200),
                    start_block_height: Some(1000),
                },
            )]),
        )]);

        let allowlist = vec![AllowlistEntry {
            account_id: "morgs.near".parse().unwrap(),
            v1_ack: true,
            migrated: true,
        }];

        let redis_client = RedisClient::default();
        let executors_handler = ExecutorsHandler::default();

        migrate_pending_indexers(
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
        }];

        let redis_client = RedisClient::default();
        let executors_handler = ExecutorsHandler::default();

        migrate_pending_indexers(
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
                    schema: Some(String::new()),
                    filter: IndexerRule {
                        id: None,
                        name: None,
                        indexer_rule_kind: IndexerRuleKind::Action,
                        matching_rule: MatchingRule::ActionAny {
                            affected_account_id: "queryapi.dataplatform.near".to_string(),
                            status: Status::Any,
                        },
                    },
                    created_at_block_height: 101,
                    updated_at_block_height: Some(200),
                    start_block_height: Some(1000),
                },
            )]),
        )]);

        let allowlist = vec![AllowlistEntry {
            account_id: "morgs.near".parse().unwrap(),
            v1_ack: true,
            migrated: false,
        }];

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_srem::<&str, String>()
            .with(
                predicate::eq("streams"),
                predicate::eq(String::from("morgs.near/test:historical:stream")),
            )
            .returning(|_, _| Ok(()))
            .once();
        redis_client
            .expect_srem::<&str, String>()
            .with(
                predicate::eq("streams"),
                predicate::eq(String::from("morgs.near/test:real_time:stream")),
            )
            .returning(|_, _| Ok(()))
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

        migrate_pending_indexers(
            &indexer_registry,
            &allowlist,
            &redis_client,
            &executors_handler,
        )
        .await
        .unwrap();
    }
}
