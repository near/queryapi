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

    for indexers in indexer_registry.values() {
        for indexer_config in indexers.values() {
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
                    indexer_config.filter.matching_rule.clone(),
                )
                .await?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::collections::HashMap;

    use registry_types::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

    use crate::registry::IndexerConfig;

    #[tokio::test]
    async fn something() {
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
                        start_block_height: None,
                    },
                )]),
            )]))
        });

        let mut redis_client = RedisClient::default();
        redis_client
            .expect_get::<String, u64>()
            .returning(|_| Ok(1));

        let mut block_stream_handler = BlockStreamHandler::default();
        block_stream_handler
            .expect_start()
            .returning(|_, _, _, _| Ok(()));

        let _ =
            synchronise_registry_config(&registry, &redis_client, &mut block_stream_handler).await;
    }
}
