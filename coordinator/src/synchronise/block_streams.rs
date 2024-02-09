use registry_types::StartBlock;
use tracing::Instrument;

use crate::block_streams_handler::{BlockStreamsHandler, StreamInfo};
use crate::indexer_config::IndexerConfig;
use crate::redis::RedisClient;
use crate::registry::IndexerRegistry;

pub async fn synchronise_block_streams(
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

            let span = tracing::info_span!(
                "Synchronising block stream",
                account_id = account_id.as_str(),
                function_name = function_name.as_str(),
                current_version = indexer_config.get_registry_version()
            );

            synchronise_block_stream(
                active_block_stream,
                indexer_config,
                redis_client,
                block_streams_handler,
            )
            .instrument(span)
            .await?;
        }
    }

    // TODO stop all method?
    for unregistered_block_stream in active_block_streams {
        tracing::info!(
            account_id = unregistered_block_stream.account_id.as_str(),
            function_name = unregistered_block_stream.function_name,
            version = unregistered_block_stream.version,
            "Stopping unregistered block stream"
        );

        block_streams_handler
            .stop(unregistered_block_stream.stream_id)
            .await?;
    }

    Ok(())
}

async fn synchronise_block_stream(
    active_block_stream: Option<StreamInfo>,
    indexer_config: &IndexerConfig,
    redis_client: &RedisClient,
    block_streams_handler: &BlockStreamsHandler,
) -> anyhow::Result<()> {
    if let Some(active_block_stream) = active_block_stream {
        if active_block_stream.version == indexer_config.get_registry_version() {
            return Ok(());
        }

        tracing::info!(
            previous_version = active_block_stream.version,
            "Stopping outdated block stream"
        );

        block_streams_handler
            .stop(active_block_stream.stream_id)
            .await?;
    }

    let stream_version = redis_client.get_stream_version(indexer_config).await?;

    let start_block_height =
        determine_start_block_height(stream_version, indexer_config, redis_client).await?;

    clear_block_stream_if_needed(stream_version, indexer_config, redis_client).await?;

    tracing::info!("Starting block stream");

    block_streams_handler
        .start(start_block_height, indexer_config)
        .await?;

    redis_client.set_stream_version(indexer_config).await?;

    Ok(())
}

async fn clear_block_stream_if_needed(
    stream_version: Option<u64>,
    indexer_config: &IndexerConfig,
    redis_client: &RedisClient,
) -> anyhow::Result<()> {
    let just_migrated_or_unmodified = stream_version.map_or(true, |version| {
        version == indexer_config.get_registry_version()
    });

    if !just_migrated_or_unmodified {
        match indexer_config.start_block {
            StartBlock::Latest | StartBlock::Height(_) => {
                tracing::info!("Clearing redis stream");

                redis_client.clear_block_stream(indexer_config).await?;
            }
            _ => {}
        }
    }

    Ok(())
}

async fn determine_start_block_height(
    stream_version: Option<u64>,
    indexer_config: &IndexerConfig,
    redis_client: &RedisClient,
) -> anyhow::Result<u64> {
    let registry_version = indexer_config.get_registry_version();

    let just_migrated_or_unmodified =
        stream_version.map_or(true, |version| version == registry_version);

    if just_migrated_or_unmodified || indexer_config.start_block == StartBlock::Continue {
        return Ok(redis_client
            .get_last_published_block(indexer_config)
            .await?
            .unwrap_or_else(|| {
                tracing::warn!(
                    account_id = indexer_config.account_id.as_str(),
                    function_name = indexer_config.function_name,
                    version = registry_version,
                    "Indexer has no `last_published_block`, using registry version"
                );

                // TODO Probably throw error rather than use this
                registry_version
            }));
    }

    match indexer_config.start_block {
        StartBlock::Latest => Ok(registry_version),
        StartBlock::Height(height) => Ok(height),
        _ => {
            unreachable!("StartBlock::Continue already handled")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::HashMap;

    use mockall::predicate;
    use registry_types::{Rule, Status};

    #[tokio::test]
    async fn resumes_stream_with_matching_redis_version() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: Some(200),
            start_block: StartBlock::Height(100),
        };

        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(200)))
            .once();
        redis_client
            .expect_get_last_published_block()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(500)))
            .once();
        redis_client
            .expect_set_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();
        redis_client.expect_clear_block_stream().never();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler
            .expect_start()
            .with(predicate::eq(500), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn starts_stream_with_latest() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: Some(200),
            start_block: StartBlock::Latest,
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(1)))
            .once();
        redis_client
            .expect_clear_block_stream()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();
        redis_client
            .expect_set_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler.expect_stop().never();
        block_stream_handler
            .expect_start()
            .with(predicate::eq(200), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn starts_stream_with_height() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: Some(200),
            start_block: StartBlock::Height(100),
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(1)))
            .once();
        redis_client
            .expect_clear_block_stream()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();
        redis_client
            .expect_set_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler.expect_stop().never();
        block_stream_handler
            .expect_start()
            .with(predicate::eq(100), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn starts_stream_with_continue() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: Some(200),
            start_block: StartBlock::Continue,
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(1)))
            .once();
        redis_client
            .expect_get_last_published_block()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(100)))
            .once();
        redis_client
            .expect_set_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler.expect_stop().never();
        block_stream_handler
            .expect_start()
            .with(predicate::eq(100), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn stops_stream_not_in_registry() {
        let indexer_registry = HashMap::from([]);

        let redis_client = RedisClient::default();

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
    async fn ignores_stream_with_matching_registry_version() {
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
                    updated_at_block_height: None,
                    start_block: StartBlock::Latest,
                },
            )]),
        )]);

        let redis_client = RedisClient::default();

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
    async fn restarts_streams_when_registry_version_differs() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: String::new(),
            schema: String::new(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 101,
            updated_at_block_height: Some(199),
            start_block: StartBlock::Height(1000),
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(101)))
            .once();
        redis_client
            .expect_clear_block_stream()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();
        redis_client
            .expect_set_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

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
            .with(predicate::eq(1000), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn resumes_stream_post_migration() {
        let indexer_config = IndexerConfig {
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
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(None))
            .once();
        redis_client
            .expect_get_last_published_block()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(100)))
            .once();
        redis_client
            .expect_set_stream_version()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();
        redis_client.expect_del::<String>().never();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler.expect_stop().never();
        block_stream_handler
            .expect_start()
            .with(predicate::eq(100), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(&indexer_registry, &redis_client, &block_stream_handler)
            .await
            .unwrap();
    }
}
