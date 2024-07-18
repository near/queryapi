use std::collections::HashMap;
use std::sync::Mutex;

use near_lake_framework::near_indexer_primitives;
use tonic::{Request, Response, Status};

use crate::indexer_config::IndexerConfig;
use crate::rules::types::ChainId;

use crate::block_stream;
use crate::receiver_blocks::ReceiverBlocksProcessor;
use crate::server::blockstreamer;

use blockstreamer::*;

pub struct BlockStreamerService {
    redis: std::sync::Arc<crate::redis::RedisClient>,
    receiver_blocks_processor: std::sync::Arc<ReceiverBlocksProcessor>,
    lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    chain_id: ChainId,
    block_streams: Mutex<HashMap<String, block_stream::BlockStream>>,
}

impl BlockStreamerService {
    pub fn new(
        redis: std::sync::Arc<crate::redis::RedisClient>,
        receiver_blocks_processor: std::sync::Arc<ReceiverBlocksProcessor>,
        lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
    ) -> Self {
        Self {
            redis,
            receiver_blocks_processor,
            lake_s3_client,
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

    fn match_status(grpc_status: i32) -> Result<registry_types::Status, Status> {
        match grpc_status {
            1 => Ok(registry_types::Status::Success),
            2 => Ok(registry_types::Status::Fail),
            3 => Ok(registry_types::Status::Any),
            status => Err(Status::invalid_argument(format!(
                "Invalid Status provided: {}",
                status
            ))),
        }
    }
}

#[tonic::async_trait]
impl blockstreamer::block_streamer_server::BlockStreamer for BlockStreamerService {
    #[tracing::instrument(skip(self))]
    async fn get_stream(
        &self,
        request: Request<blockstreamer::GetStreamRequest>,
    ) -> Result<Response<blockstreamer::StreamInfo>, Status> {
        let request = request.into_inner();

        let lock = self.block_streams.lock().map_err(|err| {
            tracing::error!(?err, "Failed to acquire `block_streams` lock");
            tonic::Status::internal("Failed to acquire `block_streams` lock")
        })?;

        let stream_entry = lock.iter().find(|(_, block_stream)| {
            block_stream.indexer_config.account_id == request.account_id
                && block_stream.indexer_config.function_name == request.function_name
        });

        if let Some((stream_id, stream)) = stream_entry {
            Ok(Response::new(StreamInfo {
                stream_id: stream_id.to_string(),
                account_id: stream.indexer_config.account_id.to_string(),
                function_name: stream.indexer_config.function_name.to_string(),
                version: stream.version,
            }))
        } else {
            Err(Status::not_found(format!(
                "Block Stream for account {} and name {} does not exist",
                request.account_id, request.function_name
            )))
        }
    }

    #[tracing::instrument(skip(self))]
    async fn start_stream(
        &self,
        request: Request<blockstreamer::StartStreamRequest>,
    ) -> Result<Response<blockstreamer::StartStreamResponse>, Status> {
        let request = request.into_inner();

        let rule = request
            .rule
            .ok_or(Status::invalid_argument("Rule must be provided"))?;

        let rule = match rule {
            start_stream_request::Rule::ActionAnyRule(action_any) => {
                registry_types::Rule::ActionAny {
                    affected_account_id: action_any.affected_account_id,
                    status: Self::match_status(action_any.status)?,
                }
            }
            start_stream_request::Rule::ActionFunctionCallRule(action_function_call) => {
                registry_types::Rule::ActionFunctionCall {
                    affected_account_id: action_function_call.affected_account_id,
                    status: Self::match_status(action_function_call.status)?,
                    function: action_function_call.function_name,
                }
            }
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
            rule,
            function_name: request.function_name,
        };

        let lock = self.get_block_streams_lock()?;
        match lock.get(&indexer_config.get_hash_id()) {
            Some(_) => return Err(Status::already_exists("Block stream already exists")),
            None => drop(lock),
        }

        let mut block_stream = block_stream::BlockStream::new(
            indexer_config.clone(),
            self.chain_id.clone(),
            request.version,
            request.redis_stream,
        );

        block_stream
            .start(
                request.start_block_height,
                self.redis.clone(),
                self.receiver_blocks_processor.clone(),
                self.lake_s3_client.clone(),
            )
            .map_err(|err| {
                tracing::error!(?err, "Failed to start block stream");

                Status::internal("Failed to start block stream")
            })?;

        let mut lock = self.get_block_streams_lock()?;
        lock.insert(indexer_config.get_hash_id(), block_stream);

        Ok(Response::new(blockstreamer::StartStreamResponse {
            stream_id: indexer_config.get_hash_id(),
        }))
    }

    #[tracing::instrument(skip(self))]
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
                block_stream.cancel().await.map_err(|err| {
                    tracing::error!(?err, "Failed to cancel block stream");
                    Status::internal("Failed to cancel block stream")
                })?;
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
        let lock = self.block_streams.lock().map_err(|err| {
            tracing::error!(?err, "Failed to acquire `block_streams` lock");
            tonic::Status::internal("Failed to acquire `block_streams` lock")
        })?;

        let block_streams: Vec<StreamInfo> = lock
            .values()
            .map(|block_stream| StreamInfo {
                stream_id: block_stream.indexer_config.get_hash_id(),
                account_id: block_stream.indexer_config.account_id.to_string(),
                function_name: block_stream.indexer_config.function_name.clone(),
                version: block_stream.version,
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
    use mockall::predicate;

    fn create_block_streamer_service() -> BlockStreamerService {
        let mut mock_s3_client = crate::s3_client::S3Client::default();

        mock_s3_client
            .expect_get_text_file()
            .with(
                predicate::eq("near-lake-data-mainnet".to_string()),
                predicate::always(),
            )
            .returning(move |_, _| {
                Ok(crate::test_utils::generate_block_with_timestamp(
                    &chrono::Utc::now().format("%Y-%m-%d").to_string(),
                ))
            });

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();

        mock_graphql_client
            .expect_get_bitmaps_exact()
            .returning(|_, _| Ok(vec![]));

        let mock_reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);
        let mock_redis = crate::redis::RedisClient::default();

        let mut mock_lake_s3_client = crate::lake_s3_client::SharedLakeS3Client::default();
        mock_lake_s3_client
            .expect_clone()
            .returning(crate::lake_s3_client::SharedLakeS3Client::default);

        BlockStreamerService::new(
            std::sync::Arc::new(mock_redis),
            std::sync::Arc::new(mock_reciever_blocks_processor),
            mock_lake_s3_client,
        )
    }

    #[tokio::test]
    async fn get_existing_block_stream() {
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
                version: 0,
                redis_stream: "stream".to_string(),
                rule: Some(start_stream_request::Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: 1,
                })),
            }))
            .await
            .unwrap();

        let stream = block_streamer_service
            .get_stream(Request::new(GetStreamRequest {
                account_id: "morgs.near".to_string(),
                function_name: "test".to_string(),
            }))
            .await
            .unwrap();

        assert_eq!(
            stream.into_inner().stream_id,
            "16210176318434468568".to_string()
        );
    }

    #[tokio::test]
    async fn get_non_existant_block_stream() {
        let block_streamer_service = create_block_streamer_service();

        {
            let lock = block_streamer_service.get_block_streams_lock().unwrap();
            assert_eq!(lock.len(), 0);
        }

        let stream_response = block_streamer_service
            .get_stream(Request::new(GetStreamRequest {
                account_id: "morgs.near".to_string(),
                function_name: "test".to_string(),
            }))
            .await;

        assert_eq!(stream_response.err().unwrap().code(), tonic::Code::NotFound);
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
                version: 0,
                redis_stream: "stream".to_string(),
                rule: Some(start_stream_request::Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: 1,
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
                version: 0,
                redis_stream: "stream".to_string(),
                rule: Some(start_stream_request::Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: 1,
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
