use std::collections::HashMap;
use std::sync::Mutex;

use near_lake_framework::near_indexer_primitives;
use tonic::{Request, Response, Status};

use crate::indexer_config::IndexerConfig;
use crate::rules::types::indexer_rule_match::ChainId;
use crate::rules::{IndexerRule, IndexerRuleKind, MatchingRule};

use crate::block_stream;
use crate::server::blockstreamer;

use blockstreamer::*;

impl TryFrom<i32> for crate::rules::Status {
    type Error = ();

    fn try_from(status: i32) -> Result<crate::rules::Status, ()> {
        match status {
            0 => Ok(crate::rules::Status::Success),
            1 => Ok(crate::rules::Status::Fail),
            2 => Ok(crate::rules::Status::Any),
            _ => Err(()),
        }
    }
}

pub struct BlockStreamerService {
    redis_connection_manager: crate::redis::ConnectionManager,
    delta_lake_client: crate::delta_lake_client::DeltaLakeClient<crate::s3_client::S3Client>,
    chain_id: ChainId,
    block_streams: Mutex<HashMap<String, block_stream::BlockStream>>,
}

impl BlockStreamerService {
    pub fn new(
        redis_connection_manager: crate::redis::ConnectionManager,
        delta_lake_client: crate::delta_lake_client::DeltaLakeClient<crate::s3_client::S3Client>,
    ) -> Self {
        Self {
            redis_connection_manager,
            delta_lake_client,
            chain_id: ChainId::Mainnet,
            block_streams: Mutex::new(HashMap::new()),
        }
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
                let status = action_any_rule.status.try_into().map_err(|_| {
                    Status::invalid_argument("Invalid status value for ActionAnyRule")
                })?;

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

        let mut block_stream =
            block_stream::BlockStream::new(indexer_config.clone(), self.chain_id.clone());

        block_stream
            .start(
                request.start_block_height,
                self.redis_connection_manager.clone(),
                self.delta_lake_client.clone(),
            )
            .map_err(|_| Status::already_exists("Block stream already exists"))?;

        let mut lock = self
            .block_streams
            .lock()
            .map_err(|err| Status::internal(format!("Failed to acquire lock: {}", err)))?;
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
            let mut lock = self
                .block_streams
                .lock()
                .map_err(|err| Status::internal(format!("Failed to acquire lock: {}", err)))?;
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
