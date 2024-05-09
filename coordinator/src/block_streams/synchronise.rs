use registry_types::StartBlock;

use crate::indexer_config::IndexerConfig;
use crate::indexer_state::{IndexerStateManager, SyncStatus};
use crate::redis::RedisClient;
use crate::registry::IndexerRegistry;

use super::handler::{BlockStreamsHandler, StreamInfo};

pub async fn synchronise_block_streams(
    indexer_registry: &IndexerRegistry,
    indexer_manager: &IndexerStateManager,
    redis_client: &RedisClient,
    block_streams_handler: &BlockStreamsHandler,
) -> anyhow::Result<()> {
    let mut active_block_streams = block_streams_handler.list().await?;

    for (account_id, indexers) in indexer_registry.iter() {
        for (function_name, indexer_config) in indexers.iter() {
            let active_block_stream = active_block_streams
                .iter()
                .position(|stream| {
                    stream.account_id == *account_id && &stream.function_name == function_name
                })
                .map(|index| active_block_streams.swap_remove(index));

            let _ = synchronise_block_stream(
                active_block_stream,
                indexer_config,
                indexer_manager,
                redis_client,
                block_streams_handler,
            )
            .await
            .map_err(|err| {
                tracing::error!(
                    account_id = account_id.as_str(),
                    function_name,
                    version = indexer_config.get_registry_version(),
                    "failed to sync block stream: {err:?}"
                )
            });
        }
    }

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

#[tracing::instrument(
    skip_all,
    fields(
        account_id = %indexer_config.account_id,
        function_name = indexer_config.function_name,
        version = indexer_config.get_registry_version()
    )
)]
async fn synchronise_block_stream(
    active_block_stream: Option<StreamInfo>,
    indexer_config: &IndexerConfig,
    indexer_manager: &IndexerStateManager,
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

    let sync_status = indexer_manager.get_sync_status(indexer_config).await?;

    clear_block_stream_if_needed(&sync_status, indexer_config, redis_client).await?;

    let start_block_height =
        determine_start_block_height(&sync_status, indexer_config, redis_client).await?;

    tracing::info!(
        "Starting new block stream starting at block {}",
        start_block_height
    );

    block_streams_handler
        .start(start_block_height, indexer_config)
        .await?;

    indexer_manager.set_synced(indexer_config).await?;

    Ok(())
}

async fn clear_block_stream_if_needed(
    sync_status: &SyncStatus,
    indexer_config: &IndexerConfig,
    redis_client: &RedisClient,
) -> anyhow::Result<()> {
    if matches!(sync_status, SyncStatus::Synced | SyncStatus::New)
        || indexer_config.start_block == StartBlock::Continue
    {
        return Ok(());
    }

    tracing::info!("Clearing redis stream");

    redis_client.clear_block_stream(indexer_config).await
}

async fn determine_start_block_height(
    sync_status: &SyncStatus,
    indexer_config: &IndexerConfig,
    redis_client: &RedisClient,
) -> anyhow::Result<u64> {
    if sync_status == &SyncStatus::Synced {
        tracing::info!("Resuming block stream");

        return get_continuation_block_height(indexer_config, redis_client).await;
    }

    match indexer_config.start_block {
        StartBlock::Latest => Ok(indexer_config.get_registry_version()),
        StartBlock::Height(height) => Ok(height),
        StartBlock::Continue => get_continuation_block_height(indexer_config, redis_client).await,
    }
}

async fn get_continuation_block_height(
    indexer_config: &IndexerConfig,
    redis_client: &RedisClient,
) -> anyhow::Result<u64> {
    redis_client
        .get_last_published_block(indexer_config)
        .await?
        .map(|height| height + 1)
        .ok_or(anyhow::anyhow!("Indexer has no `last_published_block`"))
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::HashMap;

    use mockall::predicate;
    use registry_types::{Rule, Status};

    #[tokio::test]
    async fn resumes_previously_synced_stream() {
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

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::Synced));
        mock_indexer_manager
            .expect_set_synced()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_last_published_block()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(500)))
            .once();
        redis_client.expect_clear_block_stream().never();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler
            .expect_start()
            .with(predicate::eq(501), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
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

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::Outdated));
        mock_indexer_manager
            .expect_set_synced()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_clear_block_stream()
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

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
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

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::Outdated));
        mock_indexer_manager
            .expect_set_synced()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_clear_block_stream()
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

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
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

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::Outdated));
        mock_indexer_manager
            .expect_set_synced()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_last_published_block()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(Some(100)))
            .once();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler.expect_stop().never();
        block_stream_handler
            .expect_start()
            .with(predicate::eq(101), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn stops_stream_not_in_registry() {
        let indexer_registry = HashMap::from([]);

        let redis_client = RedisClient::default();

        let mock_indexer_manager = IndexerStateManager::default();

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

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn ignores_synced_stream() {
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
            updated_at_block_height: None,
            start_block: StartBlock::Latest,
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let redis_client = RedisClient::default();

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::Synced));

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

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn restarts_unsynced_streams() {
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

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::Outdated));
        mock_indexer_manager
            .expect_set_synced()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_clear_block_stream()
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

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn skips_stream_without_last_published_block() {
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
            start_block: StartBlock::Continue,
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::Outdated));

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get_last_published_block()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| anyhow::bail!("no last_published_block"))
            .once();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler.expect_stop().never();
        block_stream_handler.expect_start().never();

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn starts_new_stream() {
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
            updated_at_block_height: None,
            start_block: StartBlock::Height(50),
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut mock_indexer_manager = IndexerStateManager::default();
        mock_indexer_manager
            .expect_get_sync_status()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(SyncStatus::New));
        mock_indexer_manager
            .expect_set_synced()
            .with(predicate::eq(indexer_config.clone()))
            .returning(|_| Ok(()))
            .once();

        let redis_client = RedisClient::default();

        let mut block_stream_handler = BlockStreamsHandler::default();
        block_stream_handler.expect_list().returning(|| Ok(vec![]));
        block_stream_handler.expect_stop().never();
        block_stream_handler
            .expect_start()
            .with(predicate::eq(50), predicate::eq(indexer_config))
            .returning(|_, _| Ok(()))
            .once();

        synchronise_block_streams(
            &indexer_registry,
            &mock_indexer_manager,
            &redis_client,
            &block_stream_handler,
        )
        .await
        .unwrap();
    }
}
