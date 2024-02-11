use crate::indexer_config::IndexerConfig;
use crate::registry::IndexerRegistry;

use super::handler::{ExecutorInfo, ExecutorsHandler};

const V1_EXECUTOR_VERSION: u64 = 0;

pub async fn synchronise_executors(
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

            let _ = synchronise_executor(active_executor, indexer_config, executors_handler)
                .await
                .map_err(|err| {
                    tracing::error!(
                        account_id = account_id.as_str(),
                        function_name,
                        version = indexer_config.get_registry_version(),
                        "failed to sync executor: {err:?}"
                    )
                });
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

#[tracing::instrument(
    skip_all,
    fields(
        account_id = %indexer_config.account_id,
        function_name = indexer_config.function_name,
        version = indexer_config.get_registry_version()
    )
)]
async fn synchronise_executor(
    active_executor: Option<ExecutorInfo>,
    indexer_config: &IndexerConfig,
    executors_handler: &ExecutorsHandler,
) -> anyhow::Result<()> {
    let registry_version = indexer_config.get_registry_version();

    if let Some(active_executor) = active_executor {
        if active_executor.version == registry_version {
            return Ok(());
        }

        tracing::info!("Stopping outdated executor");

        executors_handler.stop(active_executor.executor_id).await?;
    }

    tracing::info!("Starting executor");

    executors_handler.start(indexer_config).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::HashMap;

    use mockall::predicate;
    use registry_types::{Rule, StartBlock, Status};

    use crate::indexer_config::IndexerConfig;

    #[tokio::test]
    async fn starts_executor() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: "code".to_string(),
            schema: "schema".to_string(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: None,
            start_block: StartBlock::Height(100),
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
        )]);

        let mut executors_handler = ExecutorsHandler::default();
        executors_handler.expect_list().returning(|| Ok(vec![]));
        executors_handler
            .expect_start()
            .with(predicate::eq(indexer_config))
            .returning(|_| Ok(()))
            .once();

        synchronise_executors(&indexer_registry, &executors_handler)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn restarts_executor_when_registry_version_differs() {
        let indexer_config = IndexerConfig {
            account_id: "morgs.near".parse().unwrap(),
            function_name: "test".to_string(),
            code: "code".to_string(),
            schema: "schema".to_string(),
            rule: Rule::ActionAny {
                affected_account_id: "queryapi.dataplatform.near".to_string(),
                status: Status::Any,
            },
            created_at_block_height: 1,
            updated_at_block_height: Some(2),
            start_block: StartBlock::Height(100),
        };
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([("test".to_string(), indexer_config.clone())]),
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
            .with(predicate::eq(indexer_config))
            .returning(|_| Ok(()))
            .once();

        synchronise_executors(&indexer_registry, &executors_handler)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn ignores_executor_with_matching_registry_version() {
        let indexer_registry = HashMap::from([(
            "morgs.near".parse().unwrap(),
            HashMap::from([(
                "test".to_string(),
                IndexerConfig {
                    account_id: "morgs.near".parse().unwrap(),
                    function_name: "test".to_string(),
                    code: "code".to_string(),
                    schema: "schema".to_string(),
                    rule: Rule::ActionAny {
                        affected_account_id: "queryapi.dataplatform.near".to_string(),
                        status: Status::Any,
                    },
                    created_at_block_height: 1,
                    updated_at_block_height: Some(2),
                    start_block: StartBlock::Height(100),
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
    async fn stops_executor_not_in_registry() {
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
