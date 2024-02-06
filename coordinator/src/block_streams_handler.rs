#![cfg_attr(test, allow(dead_code))]

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
    pub fn connect(block_streamer_url: &str) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(block_streamer_url.to_string())
            .context("Block Streamer URL is invalid")?
            .connect_lazy();
        let client = BlockStreamerClient::new(channel);

        Ok(Self { client })
    }

    pub async fn list(&self) -> anyhow::Result<Vec<StreamInfo>> {
        exponential_retry(|| async {
            let response = self
                .client
                .clone()
                .list_streams(Request::new(ListStreamsRequest {}))
                .await
                .context("Failed to list streams")?;

            let streams = response.into_inner().streams;

            tracing::debug!("List streams response: {:#?}", streams);

            Ok(streams)
        })
        .await
    }

    pub async fn stop(&self, stream_id: String) -> anyhow::Result<()> {
        let request = StopStreamRequest {
            stream_id: stream_id.clone(),
        };

        let response = self
            .client
            .clone()
            .stop_stream(Request::new(request.clone()))
            .await
            .map_err(|e| {
                tracing::error!(stream_id, "Failed to stop stream\n{e:?}");
            });

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

    pub async fn start(
        &self,
        start_block_height: u64,
        account_id: String,
        function_name: String,
        version: u64,
        redis_stream: String,
        rule: registry_types::Rule,
    ) -> anyhow::Result<()> {
        let rule = match &rule {
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
            version,
            redis_stream,
            account_id: account_id.clone(),
            function_name: function_name.clone(),
            rule: Some(rule),
        };

        let response = self
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

        tracing::debug!(
            account_id,
            function_name,
            version,
            "Start stream response: {:#?}",
            response
        );

        Ok(())
    }
}
