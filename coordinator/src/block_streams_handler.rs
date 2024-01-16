use anyhow::Context;
use tonic::transport::channel::Channel;
use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{
    start_stream_request::Rule, ActionAnyRule, ActionFunctionCallRule, ListStreamsRequest,
    StartStreamRequest, Status, StopStreamRequest, StreamInfo,
};

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
        let client = BlockStreamerClient::connect(block_streamer_url)
            .await
            .context("Unable to connect to Block Streamer")?;

        Ok(Self { client })
    }

    pub async fn list(&self) -> anyhow::Result<Vec<StreamInfo>> {
        let response = self
            .client
            .clone()
            .list_streams(Request::new(ListStreamsRequest {}))
            .await?;

        Ok(response.into_inner().streams)
    }

    pub async fn stop(&self, stream_id: String) -> anyhow::Result<()> {
        let request = Request::new(StopStreamRequest { stream_id });

        tracing::debug!("Sending stop stream request: {:#?}", request);

        let _ = self.client.clone().stop_stream(request).await?;

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
                anyhow::bail!(
                    "Encountered unsupported indexer rule: {:?}",
                    unsupported_rule
                )
            }
        };

        let request = Request::new(StartStreamRequest {
            start_block_height,
            account_id,
            function_name,
            version,
            redis_stream,
            rule: Some(rule),
        });

        tracing::debug!("Sending start stream request: {:#?}", request);

        let _ = self.client.clone().start_stream(request).await?;

        Ok(())
    }
}
