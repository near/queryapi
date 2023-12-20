use std::collections::HashMap;
use std::sync::Mutex;

use near_lake_framework::near_indexer_primitives;
use tonic::{Request, Response, Status};

use crate::indexer_config::IndexerConfig;
use crate::rules::types::ChainId;
use registry_types::{IndexerRule, IndexerRuleKind, MatchingRule};

use crate::block_stream;
use crate::server::blockstreamer;

use blockstreamer::*;

pub struct BlockStreamerService {
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
    lake_s3_config: aws_sdk_s3::Config,
    chain_id: ChainId,
    block_streams: Mutex<HashMap<String, block_stream::BlockStream>>,
}

impl BlockStreamerService {
    pub fn new(
        redis_client: std::sync::Arc<crate::redis::RedisClient>,
        delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
        lake_s3_config: aws_sdk_s3::Config,
    ) -> Self {
        Self {
            redis_client,
            delta_lake_client,
            lake_s3_config,
            chain_id: ChainId::Mainnet,
            block_streams: Mutex::new(HashMap::new()),
        }
    }

    fn get_block_streams_lock(
        &self,
    ) -> Result<std::sync::MutexGuard<HashMap<String, block_stream::BlockStream>>, Status> {
        self.block_streams
            .lock()
            .map_err(|err| Status::internal(format!("Failed to acquire lock: {}", err)))
    }
}

#[tonic::async_trait]
impl blockstreamer::block_streamer_server::BlockStreamer for BlockStreamerService {
    async fn start_stream(
        &self,
        request: Request<blockstreamer::StartStreamRequest>,
    ) -> Result<Response<blockstreamer::StartStreamResponse>, Status> {
        let request = request.into_inner();

        let rule = request
            .rule
            .ok_or(Status::invalid_argument("Rule must be provided"))?;

        let matching_rule = match rule {
            start_stream_request::Rule::ActionAnyRule(action_any_rule) => {
                let affected_account_id = action_any_rule.affected_account_id;
                let status = match action_any_rule.status {
                    0 => Ok(registry_types::Status::Success),
                    1 => Ok(registry_types::Status::Fail),
                    2 => Ok(registry_types::Status::Any),
                    _ => Err(Status::invalid_argument(
                        "Invalid status value for ActionAnyRule",
                    )),
                }?;

                MatchingRule::ActionAny {
                    affected_account_id,
                    status,
                }
            }
            _ => {
                return Err(Status::unimplemented(
                    "Rules other than ActionAny are not supported yet",
                ))
            }
        };
        let filter_rule = IndexerRule {
            // TODO: Remove kind as it is unused
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule,
            id: None,
            name: None,
        };

        let account_id = near_indexer_primitives::types::AccountId::try_from(request.account_id)
            .map_err(|err| {
                Status::invalid_argument(format!(
                    "Invalid account_id value for StartStreamRequest: {}",
                    err
                ))
            })?;
        let indexer_config = IndexerConfig {
            account_id,
            function_name: request.function_name,
            indexer_rule: filter_rule,
        };

        let lock = self.get_block_streams_lock()?;
        match lock.get(&indexer_config.get_hash_id()) {
            Some(_) => return Err(Status::already_exists("Block stream already exists")),
            None => drop(lock),
        }

        let mut block_stream =
            block_stream::BlockStream::new(indexer_config.clone(), self.chain_id.clone());

        block_stream
            .start(
                request.start_block_height,
                self.redis_client.clone(),
                self.delta_lake_client.clone(),
                self.lake_s3_config.clone(),
            )
            .map_err(|_| Status::internal("Failed to start block stream"))?;

        let mut lock = self.get_block_streams_lock()?;
        lock.insert(indexer_config.get_hash_id(), block_stream);

        Ok(Response::new(blockstreamer::StartStreamResponse {
            stream_id: indexer_config.get_hash_id(),
        }))
    }

    async fn stop_stream(
        &self,
        request: Request<blockstreamer::StopStreamRequest>,
    ) -> Result<Response<blockstreamer::StopStreamResponse>, Status> {
        let request = request.into_inner();

        let stream_id = request.stream_id;

        let exising_block_stream = {
            let mut lock = self.get_block_streams_lock()?;
            lock.remove(&stream_id)
        };

        match exising_block_stream {
            None => {
                return Err(Status::not_found(format!(
                    "Block stream with id {} not found",
                    stream_id
                )))
            }
            Some(mut block_stream) => {
                block_stream
                    .cancel()
                    .await
                    .map_err(|_| Status::internal("Failed to cancel block stream"))?;
            }
        }

        Ok(Response::new(blockstreamer::StopStreamResponse {
            status: "ok".to_string(),
        }))
    }

    async fn list_streams(
        &self,
        _request: Request<blockstreamer::ListStreamsRequest>,
    ) -> Result<Response<blockstreamer::ListStreamsResponse>, Status> {
        let lock = self.block_streams.lock().unwrap();
        let block_streams: Vec<StreamInfo> = lock
            .values()
            .map(|block_stream| StreamInfo {
                stream_id: block_stream.indexer_config.get_hash_id(),
                chain_id: self.chain_id.to_string(),
                indexer_name: block_stream.indexer_config.get_full_name(),
                start_block_height: 0,
                status: "OK".to_string(),
                // last_indexed_block
            })
            .collect();

        let response = blockstreamer::ListStreamsResponse {
            streams: block_streams,
        };

        Ok(Response::new(response))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use blockstreamer::block_streamer_server::BlockStreamer;

    fn create_block_streamer_service() -> BlockStreamerService {
        let mut mock_delta_lake_client = crate::delta_lake_client::DeltaLakeClient::default();
        mock_delta_lake_client
            .expect_get_latest_block_metadata()
            .returning(|| {
                Ok(crate::delta_lake_client::LatestBlockMetadata {
                    last_indexed_block: "107503703".to_string(),
                    processed_at_utc: "".to_string(),
                    first_indexed_block: "".to_string(),
                    last_indexed_block_date: "".to_string(),
                    first_indexed_block_date: "".to_string(),
                })
            });
        mock_delta_lake_client
            .expect_list_matching_block_heights()
            .returning(|_, _| Ok(vec![]));

        let mut mock_redis_client = crate::redis::RedisClient::default();
        mock_redis_client
            .expect_xadd::<String, u64>()
            .returning(|_, _| Ok(()));

        let lake_s3_config = crate::test_utils::create_mock_lake_s3_config(&[107503704]);

        BlockStreamerService::new(
            std::sync::Arc::new(mock_redis_client),
            std::sync::Arc::new(mock_delta_lake_client),
            lake_s3_config,
        )
    }

    #[tokio::test]
    async fn starts_a_block_stream() {
        let block_streamer_service = create_block_streamer_service();

        {
            let lock = block_streamer_service.get_block_streams_lock().unwrap();
            assert_eq!(lock.len(), 0);
        }

        block_streamer_service
            .start_stream(Request::new(StartStreamRequest {
                start_block_height: 0,
                account_id: "morgs.near".to_string(),
                function_name: "test".to_string(),
                rule: Some(start_stream_request::Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: 0,
                })),
            }))
            .await
            .unwrap();

        let lock = block_streamer_service.get_block_streams_lock().unwrap();
        assert_eq!(lock.len(), 1);
    }

    #[tokio::test]
    async fn stops_a_block_stream() {
        let block_streamer_service = create_block_streamer_service();

        assert_eq!(
            block_streamer_service
                .list_streams(Request::new(ListStreamsRequest {}))
                .await
                .unwrap()
                .into_inner()
                .streams
                .len(),
            0
        );

        block_streamer_service
            .start_stream(Request::new(StartStreamRequest {
                start_block_height: 0,
                account_id: "morgs.near".to_string(),
                function_name: "test".to_string(),
                rule: Some(start_stream_request::Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: 0,
                })),
            }))
            .await
            .unwrap();

        assert_eq!(
            block_streamer_service
                .list_streams(Request::new(ListStreamsRequest {}))
                .await
                .unwrap()
                .into_inner()
                .streams
                .len(),
            1
        );

        block_streamer_service
            .stop_stream(Request::new(StopStreamRequest {
                // ID for indexer morgs.near/test
                stream_id: "16210176318434468568".to_string(),
            }))
            .await
            .unwrap();

        assert_eq!(
            block_streamer_service
                .list_streams(Request::new(ListStreamsRequest {}))
                .await
                .unwrap()
                .into_inner()
                .streams
                .len(),
            0
        );
    }
}
