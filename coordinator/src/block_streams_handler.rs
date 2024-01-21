use anyhow::Context;
use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{
    start_stream_request::Rule, ActionAnyRule, ActionFunctionCallRule, ListStreamsRequest,
    StartStreamRequest, Status, StopStreamRequest, StreamInfo,
};
use tonic::transport::channel::Channel;
use tonic::Request;

use crate::utils::exponential_retry;

#[cfg(not(test))]
pub use BlockStreamsHandlerImpl as BlockStreamsHandler;
#[cfg(test)]
pub use MockBlockStreamsHandlerImpl as BlockStreamsHandler;

pub struct BlockStreamsHandlerImpl {
    client: BlockStreamerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl BlockStreamsHandlerImpl {
    pub async fn connect(block_streamer_url: String) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(block_streamer_url)
            .context("Block Streamer URL is invalid")?
            .connect_lazy();
        let client = BlockStreamerClient::new(channel);

        Ok(Self { client })
    }

    pub async fn list(&self) -> anyhow::Result<Vec<StreamInfo>> {
        exponential_retry(
            || async {
                let response = self
                    .client
                    .clone()
                    .list_streams(Request::new(ListStreamsRequest {}))
                    .await
                    .context("Failed to list streams")?;

                Ok(response.into_inner().streams)
            },
            |e: &anyhow::Error| {
                e.downcast_ref::<tonic::Status>()
                    .map(|s| s.code() == tonic::Code::Unavailable)
                    .unwrap_or(false)
            },
        )
        .await
    }

    pub async fn stop(&self, stream_id: String) -> anyhow::Result<()> {
        let request = StopStreamRequest {
            stream_id: stream_id.clone(),
        };

        tracing::debug!("Sending stop stream request: {:#?}", request);

        let _ = self
            .client
            .clone()
            .stop_stream(Request::new(request.clone()))
            .await
            .map_err(|e| {
                tracing::error!(stream_id, "Failed to stop stream\n{e:?}");
            });

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

    pub async fn start(
        &self,
        start_block_height: u64,
        account_id: String,
        function_name: String,
        version: u64,
        redis_stream: String,
        rule: registry_types::MatchingRule,
    ) -> anyhow::Result<()> {
        let rule = match &rule {
            registry_types::MatchingRule::ActionAny {
                affected_account_id,
                status,
            } => Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: affected_account_id.to_owned(),
                status: Self::match_status(status),
            }),
            registry_types::MatchingRule::ActionFunctionCall {
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
            version,
            redis_stream,
            account_id: account_id.clone(),
            function_name: function_name.clone(),
            rule: Some(rule),
        };

        tracing::debug!("Sending start stream request: {:#?}", request);

        let _ = self
            .client
            .clone()
            .start_stream(Request::new(request.clone()))
            .await
            .map_err(|error| {
                tracing::error!(
                    account_id,
                    function_name,
                    "Failed to start stream\n{error:?}"
                );
            });

        Ok(())
    }
}
