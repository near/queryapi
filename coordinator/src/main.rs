use crate::block_streams_handler::BlockStreamsHandler;
use crate::redis::RedisClient;
use crate::registry::Registry;

mod block_streams_handler;
mod redis;
mod registry;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let registry = Registry::connect("https://rpc.mainnet.near.org");
    let redis_client = RedisClient::connect("redis://127.0.0.1").await?;
    let mut block_stream_handler = BlockStreamsHandler::connect().await?;

    synchronise_registry_config(&registry, &redis_client, &mut block_stream_handler).await?;

    Ok(())
}

async fn synchronise_registry_config(
    registry: &Registry,
    redis_client: &RedisClient,
    block_streams_handler: &mut BlockStreamsHandler,
) -> anyhow::Result<()> {
    let indexer_registry = registry.fetch().await?;
    let mut active_block_streams = block_streams_handler.list().await?;

    for (account_id, indexers) in indexer_registry.iter() {
        for (function_name, indexer_config) in indexers.iter() {
            let active_block_stream = active_block_streams
                .iter()
                .position(|stream| {
                    stream.account_id == account_id.to_string()
                        && &stream.function_name == function_name
                })
                .map(|index| active_block_streams.swap_remove(index));

            let registry_version = indexer_config
                .updated_at_block_height
                .unwrap_or(indexer_config.created_at_block_height);

            if let Some(active_block_stream) = active_block_stream {
                if active_block_stream.version == registry_version {
                    continue;
                }
            }

            let start_block_height = if let Some(start_block_height) =
                indexer_config.start_block_height
            {
                start_block_height
            } else if let Ok(last_indexed_block) = redis_client
                .get::<String, u64>(format!(
                    "{}:last_indexed_block",
                    indexer_config.get_full_name()
                ))
                .await
            {
                last_indexed_block
            } else if let Some(updated_at_block_height) = indexer_config.updated_at_block_height {
                updated_at_block_height
            } else {
                indexer_config.created_at_block_height
            };

            block_streams_handler
                .start(
                    start_block_height,
                    indexer_config.account_id.to_string(),
                    indexer_config.function_name.clone(),
                    registry_version,
                    indexer_config.filter.matching_rule.clone(),
                )
                .await?;
        }
    }

    for active_block_stream in active_block_streams {
        block_streams_handler
            .stop(active_block_stream.stream_id)
            .await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use mockall::predicate;
    use std::collections::HashMap;

    use registry_types::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

    use crate::registry::IndexerConfig;

    mod block_stream {
        use super::*;

        #[tokio::test]
        async fn uses_start_block_height_when_set() {
            let mut registry = Registry::default();
            registry.expect_fetch().returning(|| {
                Ok(HashMap::from([(
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
                            created_at_block_height: 1,
                            updated_at_block_height: None,
                            start_block_height: Some(100),
                        },
                    )]),
                )]))
            });

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| anyhow::bail!("none"));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| Ok(vec![]));
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(100),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(1),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _| Ok(()));

            synchronise_registry_config(&registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_updated_at_when_no_start_block_height() {
            let mut registry = Registry::default();
            registry.expect_fetch().returning(|| {
                Ok(HashMap::from([(
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
                            start_block_height: None,
                        },
                    )]),
                )]))
            });

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| anyhow::bail!("none"));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| Ok(vec![]));
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(200),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(200),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _| Ok(()));

            synchronise_registry_config(&registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_created_at_when_no_updated_at_block_height() {
            let mut registry = Registry::default();
            registry.expect_fetch().returning(|| {
                Ok(HashMap::from([(
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
                            updated_at_block_height: None,
                            start_block_height: None,
                        },
                    )]),
                )]))
            });

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| anyhow::bail!("none"));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| Ok(vec![]));
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(101),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(101),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _| Ok(()));

            synchronise_registry_config(&registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn stops_streams_not_in_registry() {
            let mut registry = Registry::default();
            registry.expect_fetch().returning(|| Ok(HashMap::from([])));

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| anyhow::bail!("none"));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| {
                Ok(vec![block_streamer::StreamInfo {
                    stream_id: "stream_id".to_string(),
                    account_id: "morgs.near".to_string(),
                    function_name: "test".to_string(),
                    version: 1,
                }])
            });
            block_stream_handler
                .expect_stop()
                .with(predicate::eq("stream_id".to_string()))
                .returning(|_| Ok(()))
                .once();

            synchronise_registry_config(&registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn ignores_streams_with_matching_versions() {
            let mut registry = Registry::default();
            registry.expect_fetch().returning(|| {
                Ok(HashMap::from([(
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
                            updated_at_block_height: None,
                            start_block_height: None,
                        },
                    )]),
                )]))
            });

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| anyhow::bail!("none"));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| {
                Ok(vec![block_streamer::StreamInfo {
                    stream_id: "stream_id".to_string(),
                    account_id: "morgs.near".to_string(),
                    function_name: "test".to_string(),
                    version: 101,
                }])
            });
            block_stream_handler.expect_stop().never();
            block_stream_handler.expect_start().never();

            synchronise_registry_config(&registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }
    }
}
