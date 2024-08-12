#![cfg_attr(test, allow(dead_code))]

use std::time::{Duration, SystemTime};

pub use block_streamer::StreamInfo;
use block_streamer::{StartStreamResponse, StopStreamResponse};

use anyhow::Context;
use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{
    start_stream_request::Rule, ActionAnyRule, ActionFunctionCallRule, GetStreamRequest,
    ProcessingState, StartStreamRequest, Status, StopStreamRequest,
};
use near_primitives::types::AccountId;
use registry_types::StartBlock;
use tonic::transport::channel::Channel;

use crate::indexer_config::IndexerConfig;
use crate::redis::{KeyProvider, RedisClient};

const RESTART_TIMEOUT_SECONDS: u64 = 600;

#[derive(Debug, PartialEq)]
pub enum BlockStreamStatus {
    /// Block Stream is running as expected
    Active,
    /// Existing Block Stream is in an unhealthy state
    Unhealthy,
    /// Existing Block Stream is not running
    Inactive,
    /// Block Stream is not synchronized with the latest config
    Unsynced,
    /// Block Stream has not been encountered before
    NotStarted,
}

#[cfg(not(test))]
use BlockStreamsClientWrapperImpl as BlockStreamsClientWrapper;
#[cfg(test)]
use MockBlockStreamsClientWrapperImpl as BlockStreamsClientWrapper;

#[derive(Clone)]
struct BlockStreamsClientWrapperImpl {
    inner: BlockStreamerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl BlockStreamsClientWrapperImpl {
    pub fn new(inner: BlockStreamerClient<Channel>) -> Self {
        Self { inner }
    }

    pub async fn stop_stream<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<StopStreamResponse>, tonic::Status>
    where
        R: tonic::IntoRequest<StopStreamRequest> + 'static,
    {
        self.inner.clone().stop_stream(request).await
    }

    pub async fn get_stream<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<StreamInfo>, tonic::Status>
    where
        R: tonic::IntoRequest<GetStreamRequest> + 'static,
    {
        self.inner.clone().get_stream(request).await
    }

    pub async fn start_stream<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<StartStreamResponse>, tonic::Status>
    where
        R: tonic::IntoRequest<StartStreamRequest> + 'static,
    {
        self.inner.clone().start_stream(request).await
    }
}

#[cfg(not(test))]
pub use BlockStreamsHandlerImpl as BlockStreamsHandler;
#[cfg(test)]
pub use MockBlockStreamsHandlerImpl as BlockStreamsHandler;

#[derive(Clone)]
pub struct BlockStreamsHandlerImpl {
    client: BlockStreamsClientWrapper,
    redis_client: RedisClient,
}

#[cfg_attr(test, mockall::automock)]
impl BlockStreamsHandlerImpl {
    pub fn connect(block_streamer_url: &str, redis_client: RedisClient) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(block_streamer_url.to_string())
            .context("Block Streamer URL is invalid")?
            .connect_lazy();
        let client = BlockStreamerClient::new(channel);

        Ok(Self {
            client: BlockStreamsClientWrapper::new(client),
            redis_client,
        })
    }

    pub async fn stop(&self, stream_id: String) -> anyhow::Result<()> {
        let response = self
            .client
            .stop_stream(StopStreamRequest {
                stream_id: stream_id.clone(),
            })
            .await
            .context(format!("Failed to stop stream: {stream_id}"))?;

        tracing::debug!(stream_id, "Stop stream response: {:#?}", response);

        Ok(())
    }

    fn match_status(status: &registry_types::Status) -> i32 {
        match status {
            registry_types::Status::Success => Status::Success,
            registry_types::Status::Fail => Status::Failure,
            registry_types::Status::Any => Status::Any,
        }
        .into()
    }

    pub async fn get(
        &self,
        account_id: AccountId,
        function_name: String,
    ) -> anyhow::Result<Option<StreamInfo>> {
        let request = GetStreamRequest {
            account_id: account_id.to_string(),
            function_name: function_name.clone(),
        };

        match self.client.get_stream(request).await {
            Ok(response) => Ok(Some(response.into_inner())),
            Err(status) if status.code() == tonic::Code::NotFound => Ok(None),
            Err(err) => Err(err).context(format!(
                "Failed to get stream for account {} and name {}",
                account_id, function_name
            )),
        }
    }

    pub async fn start(
        &self,
        start_block_height: u64,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<()> {
        let rule = match &indexer_config.rule {
            registry_types::Rule::ActionAny {
                affected_account_id,
                status,
            } => Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: affected_account_id.to_owned(),
                status: Self::match_status(status),
            }),
            registry_types::Rule::ActionFunctionCall {
                affected_account_id,
                status,
                function,
            } => Rule::ActionFunctionCallRule(ActionFunctionCallRule {
                affected_account_id: affected_account_id.to_owned(),
                function_name: function.to_owned(),
                status: Self::match_status(status),
            }),
            unsupported_rule => {
                tracing::error!(
                    "Encountered unsupported indexer rule: {:?}",
                    unsupported_rule
                );
                return Ok(());
            }
        };

        let request = StartStreamRequest {
            start_block_height,
            version: indexer_config.get_registry_version(),
            redis_stream: indexer_config.get_redis_stream_key(),
            account_id: indexer_config.account_id.to_string(),
            function_name: indexer_config.function_name.clone(),
            rule: Some(rule),
        };

        let response = self.client.start_stream(request).await.context(format!(
            "Failed to start stream: {}",
            indexer_config.get_full_name()
        ))?;

        tracing::debug!(
            account_id = indexer_config.account_id.as_str(),
            function_name = indexer_config.function_name,
            version = indexer_config.get_registry_version(),
            "Start stream response: {:#?}",
            response
        );

        Ok(())
    }

    pub async fn reconfigure(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        self.stop_if_needed(config.account_id.clone(), config.function_name.clone())
            .await?;

        if matches!(
            config.start_block,
            StartBlock::Latest | StartBlock::Height(..)
        ) {
            self.redis_client.clear_block_stream(config).await?;
        }

        let height = match config.start_block {
            StartBlock::Latest => config.get_registry_version(),
            StartBlock::Height(height) => height,
            StartBlock::Continue => self.get_continuation_block_height(config).await?,
        };

        tracing::info!(
            start_block = ?config.start_block,
            height,
            "Starting block stream"
        );

        self.start(height, config).await?;

        Ok(())
    }

    pub async fn start_new_block_stream(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        let height = match config.start_block {
            StartBlock::Height(height) => height,
            StartBlock::Latest => config.get_registry_version(),
            StartBlock::Continue => {
                tracing::warn!(
                    "Attempted to start new Block Stream with CONTINUE, using LATEST instead"
                );
                config.get_registry_version()
            }
        };

        tracing::info!(
            start_block = ?config.start_block,
            height,
            "Starting block stream"
        );

        self.start(height, config).await
    }

    async fn get_continuation_block_height(&self, config: &IndexerConfig) -> anyhow::Result<u64> {
        let height = self
            .redis_client
            .get_last_published_block(config)
            .await?
            .map(|height| height + 1)
            .unwrap_or_else(|| {
                tracing::warn!(
                    "Failed to get continuation block height, using registry version instead"
                );

                config.get_registry_version()
            });

        Ok(height)
    }

    pub async fn resume(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        let height = self.get_continuation_block_height(config).await?;

        tracing::info!(height, "Resuming block stream");

        self.start(height, config).await?;

        Ok(())
    }

    fn is_healthy(&self, block_stream: &StreamInfo) -> bool {
        if let Some(health) = block_stream.health.as_ref() {
            let updated_at =
                SystemTime::UNIX_EPOCH + Duration::from_secs(health.updated_at_timestamp_secs);

            let stale = updated_at.elapsed().unwrap_or_default() > Duration::from_secs(180);
            let stalled = matches!(
                health.processing_state.try_into(),
                Ok(ProcessingState::Stalled)
            );

            if !stale && !stalled {
                return true;
            }
        }

        false
    }

    pub async fn stop_if_needed(
        &self,
        account_id: AccountId,
        function_name: String,
    ) -> anyhow::Result<()> {
        if let Some(block_stream) = self.get(account_id, function_name).await? {
            tracing::info!("Stopping block stream");

            self.stop(block_stream.stream_id).await?;
        }

        Ok(())
    }

    pub async fn get_status(
        &self,
        config: &IndexerConfig,
        previous_sync_version: Option<u64>,
    ) -> anyhow::Result<BlockStreamStatus> {
        if let Some(block_stream) = self
            .get(config.account_id.clone(), config.function_name.clone())
            .await?
        {
            if block_stream.version != config.get_registry_version() {
                return Ok(BlockStreamStatus::Unsynced);
            }

            if !self.is_healthy(&block_stream) {
                return Ok(BlockStreamStatus::Unhealthy);
            }

            return Ok(BlockStreamStatus::Active);
        }

        if previous_sync_version.is_none() {
            return Ok(BlockStreamStatus::NotStarted);
        }

        if previous_sync_version.unwrap() != config.get_registry_version() {
            return Ok(BlockStreamStatus::Unsynced);
        }

        Ok(BlockStreamStatus::Inactive)
    }

    pub async fn restart(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        if let Some(block_stream) = self
            .get(config.account_id.clone(), config.function_name.clone())
            .await?
        {
            self.stop(block_stream.stream_id.clone()).await?;
        }

        self.resume(config).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use mockall::predicate::*;
    use tonic::Response;

    impl Clone for MockBlockStreamsClientWrapperImpl {
        fn clone(&self) -> Self {
            Self::default()
        }
    }

    impl Clone for MockBlockStreamsHandlerImpl {
        fn clone(&self) -> Self {
            Self::default()
        }
    }

    #[tokio::test]
    async fn returns_stream_status() {
        let config = IndexerConfig::default();
        let test_cases = [
            (
                Some(StreamInfo {
                    version: config.get_registry_version(),
                    health: Some(block_streamer::Health {
                        updated_at_timestamp_secs: SystemTime::now()
                            .duration_since(SystemTime::UNIX_EPOCH)
                            .unwrap()
                            .as_secs(),
                        processing_state: ProcessingState::Running.into(),
                    }),
                    ..Default::default()
                }),
                Some(config.get_registry_version()),
                BlockStreamStatus::Active,
            ),
            (
                None,
                Some(config.get_registry_version()),
                BlockStreamStatus::Inactive,
            ),
            (
                Some(StreamInfo {
                    version: config.get_registry_version() - 1,
                    ..Default::default()
                }),
                Some(config.get_registry_version()),
                BlockStreamStatus::Unsynced,
            ),
            (
                Some(StreamInfo {
                    version: config.get_registry_version(),
                    health: None,
                    ..Default::default()
                }),
                Some(config.get_registry_version()),
                BlockStreamStatus::Unhealthy,
            ),
            (None, None, BlockStreamStatus::NotStarted),
        ];

        for (stream, previous_sync_version, expected) in test_cases {
            let mut mock_client = BlockStreamsClientWrapper::default();
            mock_client
                .expect_get_stream::<GetStreamRequest>()
                .returning(move |_| {
                    if let Some(stream) = stream.clone() {
                        Ok(Response::new(stream))
                    } else {
                        Err(tonic::Status::not_found("not found"))
                    }
                });

            let mock_redis = RedisClient::default();

            let handler = BlockStreamsHandlerImpl {
                client: mock_client,
                redis_client: mock_redis,
            };

            assert_eq!(
                expected,
                handler
                    .get_status(&config, previous_sync_version)
                    .await
                    .unwrap()
            );
        }
    }

    #[tokio::test]
    async fn resumes_streams() {
        let config = IndexerConfig::default();
        let last_published_block = 10;

        let mut mock_client = BlockStreamsClientWrapper::default();
        mock_client
            .expect_start_stream::<StartStreamRequest>()
            .with(eq(StartStreamRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                redis_stream: config.get_redis_stream_key(),
                rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: Status::Any.into(),
                })),
                start_block_height: last_published_block + 1,
                version: config.get_registry_version(),
            }))
            .returning(|_| Ok(Response::new(StartStreamResponse::default())))
            .once();

        let mut mock_redis = RedisClient::default();
        mock_redis
            .expect_get_last_published_block::<IndexerConfig>()
            .returning(move |_| Ok(Some(last_published_block)))
            .once();

        let handler = BlockStreamsHandlerImpl {
            client: mock_client,
            redis_client: mock_redis,
        };

        handler.resume(&config).await.unwrap();
    }

    #[tokio::test]
    async fn reconfigures_streams() {
        let config = IndexerConfig::default();

        let existing_stream = StreamInfo {
            account_id: config.account_id.to_string(),
            function_name: config.function_name.clone(),
            stream_id: "stream-id".to_string(),
            version: config.get_registry_version() - 1,
            health: None,
        };

        let mut mock_client = BlockStreamsClientWrapper::default();
        mock_client
            .expect_stop_stream::<StopStreamRequest>()
            .with(eq(StopStreamRequest {
                stream_id: existing_stream.stream_id.clone(),
            }))
            .returning(|_| Ok(Response::new(StopStreamResponse::default())));
        mock_client
            .expect_get_stream::<GetStreamRequest>()
            .with(eq(GetStreamRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(move |_| Ok(Response::new(existing_stream.clone())));
        mock_client
            .expect_start_stream::<StartStreamRequest>()
            .with(eq(StartStreamRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                redis_stream: config.get_redis_stream_key(),
                rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: Status::Any.into(),
                })),
                start_block_height: if let StartBlock::Height(height) = config.start_block {
                    height
                } else {
                    unreachable!()
                },
                version: config.get_registry_version(),
            }))
            .returning(|_| Ok(Response::new(StartStreamResponse::default())));

        let mut mock_redis = RedisClient::default();
        mock_redis
            .expect_clear_block_stream::<IndexerConfig>()
            .returning(|_| Ok(()))
            .once();

        let handler = BlockStreamsHandlerImpl {
            client: mock_client,
            redis_client: mock_redis,
        };

        handler.reconfigure(&config).await.unwrap();
    }

    #[tokio::test]
    async fn starts_new_streams() {
        let config = IndexerConfig::default();

        let mut mock_client = BlockStreamsClientWrapper::default();
        mock_client
            .expect_start_stream::<StartStreamRequest>()
            .with(eq(StartStreamRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                redis_stream: config.get_redis_stream_key(),
                rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                    affected_account_id: "queryapi.dataplatform.near".to_string(),
                    status: Status::Any.into(),
                })),
                start_block_height: if let StartBlock::Height(height) = config.start_block {
                    height
                } else {
                    unreachable!()
                },
                version: config.get_registry_version(),
            }))
            .returning(|_| Ok(Response::new(StartStreamResponse::default())));

        let mock_redis = RedisClient::default();

        let handler = BlockStreamsHandlerImpl {
            client: mock_client,
            redis_client: mock_redis,
        };

        handler.start_new_block_stream(&config).await.unwrap();
    }

    #[tokio::test]
    async fn unhealthy_stream() {
        tokio::time::pause();

        let config = IndexerConfig::default();

        let existing_stream = StreamInfo {
            account_id: config.account_id.to_string(),
            function_name: config.function_name.clone(),
            stream_id: "stream-id".to_string(),
            version: config.get_registry_version(),
            health: Some(block_streamer::Health {
                updated_at_timestamp_secs: SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                processing_state: ProcessingState::Stalled.into(),
            }),
        };

        let mock_client = BlockStreamsClientWrapper::default();
        let mock_redis = RedisClient::default();

        let handler = BlockStreamsHandlerImpl {
            client: mock_client,
            redis_client: mock_redis,
        };

        assert!(!handler.is_healthy(&existing_stream));
    }

    #[tokio::test]
    async fn healthy_streams() {
        tokio::time::pause();

        let config = IndexerConfig::default();

        let healthy_states = vec![
            ProcessingState::Running,
            ProcessingState::Idle,
            ProcessingState::Waiting,
        ];

        for healthy_state in healthy_states {
            let existing_stream = StreamInfo {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                stream_id: "stream-id".to_string(),
                version: config.get_registry_version(),
                health: Some(block_streamer::Health {
                    updated_at_timestamp_secs: SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    processing_state: healthy_state.into(),
                }),
            };

            let mock_client = BlockStreamsClientWrapper::default();
            let mock_redis = RedisClient::default();

            let handler = BlockStreamsHandlerImpl {
                client: mock_client,
                redis_client: mock_redis,
            };

            assert!(handler.is_healthy(&existing_stream));
        }
    }

    #[tokio::test]
    async fn clears_redis_stream() {
        let config_with_height = IndexerConfig::default();
        let config_with_latest = IndexerConfig {
            start_block: StartBlock::Latest,
            ..Default::default()
        };
        let config_with_continue = IndexerConfig {
            start_block: StartBlock::Continue,
            ..Default::default()
        };

        let mut mock_client = BlockStreamsClientWrapper::default();
        mock_client
            .expect_get_stream::<GetStreamRequest>()
            .returning(|_| Err(tonic::Status::not_found("not found")))
            .times(3);
        mock_client
            .expect_start_stream::<StartStreamRequest>()
            .with(always())
            .returning(|_| Ok(Response::new(StartStreamResponse::default())))
            .times(3);

        let mut mock_redis = RedisClient::default();
        mock_redis
            .expect_clear_block_stream::<IndexerConfig>()
            .with(eq(config_with_height.clone()))
            .returning(|_| Ok(()))
            .once();
        mock_redis
            .expect_clear_block_stream::<IndexerConfig>()
            .with(eq(config_with_latest.clone()))
            .returning(|_| Ok(()))
            .once();
        mock_redis
            .expect_clear_block_stream::<IndexerConfig>()
            .with(eq(config_with_continue.clone()))
            .never();
        mock_redis
            .expect_get_last_published_block::<IndexerConfig>()
            .returning(|_| Ok(None))
            .once();

        let handler = BlockStreamsHandlerImpl {
            client: mock_client,
            redis_client: mock_redis,
        };

        handler.reconfigure(&config_with_latest).await.unwrap();
        handler.reconfigure(&config_with_continue).await.unwrap();
        handler.reconfigure(&config_with_height).await.unwrap();
    }
}
