use std::time::Duration;

use anyhow::Context;
use near_primitives::types::AccountId;
use tokio::time::sleep;
use tracing_subscriber::prelude::*;

use crate::block_streams_handler::BlockStreamsHandler;
use crate::executors_handler::ExecutorsHandler;
use crate::migrate::migrate_pending_indexers;
use crate::redis::RedisClient;
use crate::registry::{IndexerRegistry, Registry};

mod block_streams_handler;
mod executors_handler;
mod migrate;
mod redis;
mod registry;
mod utils;

const CONTROL_LOOP_THROTTLE_SECONDS: Duration = Duration::from_secs(1);
const V1_EXECUTOR_VERSION: u64 = 0;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let rpc_url = std::env::var("RPC_URL").expect("RPC_URL is not set");
    let registry_contract_id = std::env::var("REGISTRY_CONTRACT_ID")
        .expect("REGISTRY_CONTRACT_ID is not set")
        .parse::<AccountId>()
        .expect("REGISTRY_CONTRACT_ID is not a valid account ID");
    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL is not set");
    let block_streamer_url =
        std::env::var("BLOCK_STREAMER_URL").expect("BLOCK_STREAMER_URL is not set");
    let runner_url = std::env::var("RUNNER_URL").expect("RUNNER_URL is not set");

    let registry = Registry::connect(registry_contract_id.clone(), &rpc_url);
    let redis_client = RedisClient::connect(&redis_url).await?;
    let block_streams_handler = BlockStreamsHandler::connect(&block_streamer_url)?;
    let executors_handler = ExecutorsHandler::connect(&runner_url)?;

    tracing::info!(
        rpc_url,
        registry_contract_id = registry_contract_id.as_str(),
        block_streamer_url,
        runner_url,
        redis_url,
        "Starting Coordinator"
    );

    loop {
        let indexer_registry = registry.fetch().await?;

        let allowlist = fetch_allowlist(&redis_client).await?;

        let indexer_registry = filter_registry_by_allowlist(indexer_registry, &allowlist).await?;

        migrate_pending_indexers(
            &indexer_registry,
            &allowlist,
            &redis_client,
            &executors_handler,
        )
        .await?;

        tokio::try_join!(
            synchronise_executors(&indexer_registry, &executors_handler),
            synchronise_block_streams(&indexer_registry, &redis_client, &block_streams_handler),
            async {
                sleep(CONTROL_LOOP_THROTTLE_SECONDS).await;
                Ok(())
            }
        )?;
    }
}

#[derive(serde::Deserialize, serde::Serialize, Debug)]
pub struct AllowlistEntry {
    account_id: AccountId,
    v1_ack: bool,
    migrated: bool,
}

pub type Allowlist = Vec<AllowlistEntry>;

async fn fetch_allowlist(redis_client: &RedisClient) -> anyhow::Result<Allowlist> {
    let raw_allowlist: String = redis_client.get(RedisClient::ALLOWLIST).await?;
    serde_json::from_str(&raw_allowlist).context("Failed to parse allowlist")
}

async fn filter_registry_by_allowlist(
    indexer_registry: IndexerRegistry,
    allowlist: &Allowlist,
) -> anyhow::Result<IndexerRegistry> {
    let filtered_registry: IndexerRegistry = indexer_registry
        .into_iter()
        .filter(|(account_id, _)| {
            allowlist
                .iter()
                .any(|entry| entry.account_id == *account_id && entry.v1_ack)
        })
        .collect();

    tracing::debug!(
        "Accounts in filtered registry: {:#?}",
        filtered_registry.keys()
    );

    Ok(filtered_registry)
}

async fn synchronise_executors(
    indexer_registry: &IndexerRegistry,
    executors_handler: &ExecutorsHandler,
) -> anyhow::Result<()> {
    let active_executors = executors_handler.list().await?;

    // Ignore V1 executors
    let mut active_executors: Vec<_> = active_executors
        .into_iter()
        .filter(|executor| executor.version != V1_EXECUTOR_VERSION)
        .collect();

    for (account_id, indexers) in indexer_registry.iter() {
        for (function_name, indexer_config) in indexers.iter() {
            let active_executor = active_executors
                .iter()
                .position(|stream| {
                    stream.account_id == account_id.to_string()
                        && &stream.function_name == function_name
                })
                .map(|index| active_executors.swap_remove(index));

            let registry_version = indexer_config
                .updated_at_block_height
                .unwrap_or(indexer_config.created_at_block_height);

            if let Some(active_executor) = active_executor {
                if active_executor.version == registry_version {
                    continue;
                }

                tracing::info!(
                    account_id = active_executor.account_id.as_str(),
                    function_name = active_executor.function_name,
                    registry_version = active_executor.version,
                    "Stopping executor"
                );

                executors_handler.stop(active_executor.executor_id).await?;
            }

            tracing::info!(
                account_id = account_id.as_str(),
                function_name,
                registry_version,
                "Starting executor"
            );

            executors_handler
                .start(
                    account_id.to_string(),
                    function_name.to_string(),
                    indexer_config.code.clone(),
                    indexer_config.schema.clone().unwrap_or_default(),
                    indexer_config.get_redis_stream(),
                    registry_version,
                )
                .await?;
        }
    }

    for unregistered_executor in active_executors {
        tracing::info!(
            account_id = unregistered_executor.account_id.as_str(),
            function_name = unregistered_executor.function_name,
            registry_version = unregistered_executor.version,
            "Stopping unregistered executor"
        );

        executors_handler
            .stop(unregistered_executor.executor_id)
            .await?;
    }

    Ok(())
}

async fn synchronise_block_streams(
    indexer_registry: &IndexerRegistry,
    redis_client: &RedisClient,
    block_streams_handler: &BlockStreamsHandler,
) -> anyhow::Result<()> {
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

            // TODO: Ensure start block height is only used to successfully start block stream ONCE
            // TODO: Ensure last published blockheight is used on fresh restarts for existing indexers
            if let Some(active_block_stream) = active_block_stream {
                if active_block_stream.version == registry_version {
                    continue;
                }

                tracing::info!(
                    account_id = active_block_stream.account_id.as_str(),
                    function_name = active_block_stream.function_name,
                    registry_version = active_block_stream.version,
                    "Stopping block stream"
                );

                block_streams_handler
                    .stop(active_block_stream.stream_id)
                    .await?;
            }

            let start_block_height = if let Some(start_block_height) =
                indexer_config.start_block_height
            {
                start_block_height
            } else if let Ok(last_published_block) = redis_client
                .get::<String, u64>(format!(
                    "{}:last_published_block",
                    indexer_config.get_full_name()
                ))
                .await
            {
                last_published_block
            } else if let Some(updated_at_block_height) = indexer_config.updated_at_block_height {
                updated_at_block_height
            } else {
                indexer_config.created_at_block_height
            };

            tracing::info!(
                account_id = account_id.as_str(),
                function_name,
                registry_version,
                "Starting block stream"
            );

            block_streams_handler
                .start(
                    start_block_height,
                    indexer_config.account_id.to_string(),
                    indexer_config.function_name.clone(),
                    registry_version,
                    indexer_config.get_redis_stream(),
                    indexer_config.filter.matching_rule.clone(),
                )
                .await?;
        }
    }

    for unregistered_block_stream in active_block_streams {
        tracing::info!(
            account_id = unregistered_block_stream.account_id.as_str(),
            function_name = unregistered_block_stream.function_name,
            registry_version = unregistered_block_stream.version,
            "Stopping unregistered block stream"
        );

        block_streams_handler
            .stop(unregistered_block_stream.stream_id)
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

    mod executors {
        use super::*;

        #[tokio::test]
        async fn starts_executors() {
            let indexer_registry = HashMap::from([(
                "morgs.near".parse().unwrap(),
                HashMap::from([(
                    "test".to_string(),
                    IndexerConfig {
                        account_id: "morgs.near".parse().unwrap(),
                        function_name: "test".to_string(),
                        code: "code".to_string(),
                        schema: Some("schema".to_string()),
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
            )]);

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_list().returning(|| Ok(vec![]));
            executors_handler
                .expect_start()
                .with(
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq("code".to_string()),
                    predicate::eq("schema".to_string()),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(1),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_executors(&indexer_registry, &executors_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn restarts_executors_with_mismatched_versions() {
            let indexer_registry = HashMap::from([(
                "morgs.near".parse().unwrap(),
                HashMap::from([(
                    "test".to_string(),
                    IndexerConfig {
                        account_id: "morgs.near".parse().unwrap(),
                        function_name: "test".to_string(),
                        code: "code".to_string(),
                        schema: Some("schema".to_string()),
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
                        updated_at_block_height: Some(2),
                        start_block_height: Some(100),
                    },
                )]),
            )]);

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_list().returning(|| {
                Ok(vec![runner::ExecutorInfo {
                    executor_id: "executor_id".to_string(),
                    account_id: "morgs.near".to_string(),
                    function_name: "test".to_string(),
                    status: "running".to_string(),
                    version: 1,
                }])
            });
            executors_handler
                .expect_stop()
                .with(predicate::eq("executor_id".to_string()))
                .returning(|_| Ok(()))
                .once();

            executors_handler
                .expect_start()
                .with(
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq("code".to_string()),
                    predicate::eq("schema".to_string()),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(2),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_executors(&indexer_registry, &executors_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn ignores_executors_with_matching_versions() {
            let indexer_registry = HashMap::from([(
                "morgs.near".parse().unwrap(),
                HashMap::from([(
                    "test".to_string(),
                    IndexerConfig {
                        account_id: "morgs.near".parse().unwrap(),
                        function_name: "test".to_string(),
                        code: "code".to_string(),
                        schema: Some("schema".to_string()),
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
                        updated_at_block_height: Some(2),
                        start_block_height: Some(100),
                    },
                )]),
            )]);

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_list().returning(|| {
                Ok(vec![runner::ExecutorInfo {
                    executor_id: "executor_id".to_string(),
                    account_id: "morgs.near".to_string(),
                    function_name: "test".to_string(),
                    status: "running".to_string(),
                    version: 2,
                }])
            });
            executors_handler.expect_stop().never();

            executors_handler.expect_start().never();

            synchronise_executors(&indexer_registry, &executors_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn stops_executors_not_in_registry() {
            let indexer_registry = HashMap::from([]);

            let mut executors_handler = ExecutorsHandler::default();
            executors_handler.expect_list().returning(|| {
                Ok(vec![runner::ExecutorInfo {
                    executor_id: "executor_id".to_string(),
                    account_id: "morgs.near".to_string(),
                    function_name: "test".to_string(),
                    status: "running".to_string(),
                    version: 2,
                }])
            });

            executors_handler
                .expect_stop()
                .with(predicate::eq("executor_id".to_string()))
                .returning(|_| Ok(()))
                .once();

            synchronise_executors(&indexer_registry, &executors_handler)
                .await
                .unwrap();
        }
    }

    mod block_stream {
        use super::*;

        // TODO: Add Test for when indexer updated, block stream fails to start, and then restarted successfully
        #[ignore] // TODO: Re-Enable when case is covered.
        #[tokio::test]
        async fn uses_last_published_block_height_when_restarting_existing_indexer_block_stream() {
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
                        created_at_block_height: 1,
                        updated_at_block_height: Some(200),
                        start_block_height: Some(100),
                    },
                )]),
            )]);

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| Ok(500));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| Ok(vec![]));
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(500),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(200),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_last_published_block_height_when_updating_without_start_block_height() {
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
                        created_at_block_height: 1,
                        updated_at_block_height: Some(200),
                        start_block_height: None,
                    },
                )]),
            )]);

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| Ok(500));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| {
                Ok(vec![block_streamer::StreamInfo {
                    stream_id: "morgs.near/test:block_stream".to_string(),
                    account_id: "morgs.near".to_string(),
                    function_name: "test".to_string(),
                    version: 1,
                }])
            });
            block_stream_handler
                .expect_stop()
                .with(predicate::eq("morgs.near/test:block_stream".to_string()))
                .returning(|_| Ok(()))
                .once();
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(500),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(200),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_start_block_height_for_brand_new_indexer() {
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
                        created_at_block_height: 1,
                        updated_at_block_height: None,
                        start_block_height: Some(100),
                    },
                )]),
            )]);

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
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_start_block_height_when_updating_with_start_block_height() {
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
                        created_at_block_height: 1,
                        updated_at_block_height: Some(200),
                        start_block_height: Some(100),
                    },
                )]),
            )]);

            let redis_client = RedisClient::default();

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| {
                Ok(vec![block_streamer::StreamInfo {
                    stream_id: "morgs.near/test:block_stream".to_string(),
                    account_id: "morgs.near".to_string(),
                    function_name: "test".to_string(),
                    version: 1,
                }])
            });
            block_stream_handler
                .expect_stop()
                .with(predicate::eq("morgs.near/test:block_stream".to_string()))
                .returning(|_| Ok(()))
                .once();
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(100),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(200),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_start_block_height_when_no_last_published_block_and_no_block_stream() {
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
                        created_at_block_height: 1,
                        updated_at_block_height: Some(200),
                        start_block_height: Some(100),
                    },
                )]),
            )]);

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
                    predicate::eq(200),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &mut block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_updated_block_height_when_no_last_published_block_no_block_stream_no_start_block_height(
        ) {
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
                        created_at_block_height: 1,
                        updated_at_block_height: Some(200),
                        start_block_height: None,
                    },
                )]),
            )]);

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
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn uses_created_block_height_for_brand_new_indexer_without_start() {
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
                        created_at_block_height: 1,
                        updated_at_block_height: None,
                        start_block_height: None,
                    },
                )]),
            )]);

            let mut redis_client = RedisClient::default();
            redis_client
                .expect_get::<String, u64>()
                .returning(|_| anyhow::bail!("none"));

            let mut block_stream_handler = BlockStreamsHandler::default();
            block_stream_handler.expect_list().returning(|| Ok(vec![]));
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(1),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(1),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn stops_streams_not_in_registry() {
            let indexer_registry = HashMap::from([]);

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

            synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn ignores_streams_with_matching_versions() {
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
                        updated_at_block_height: None,
                        start_block_height: None,
                    },
                )]),
            )]);

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

            synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn restarts_streams_with_mismatched_versions() {
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
            block_stream_handler
                .expect_stop()
                .with(predicate::eq("stream_id".to_string()))
                .returning(|_| Ok(()))
                .once();
            block_stream_handler
                .expect_start()
                .with(
                    predicate::eq(1000),
                    predicate::eq("morgs.near".to_string()),
                    predicate::eq("test".to_string()),
                    predicate::eq(200),
                    predicate::eq("morgs.near/test:block_stream".to_string()),
                    predicate::eq(MatchingRule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    }),
                )
                .returning(|_, _, _, _, _, _| Ok(()));

            synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
                .await
                .unwrap();
        }
    }
}
