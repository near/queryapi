use tonic::transport::channel::Channel;
use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{start_stream_request::Rule, ActionAnyRule, StartStreamRequest, Status};

#[cfg(not(test))]
pub use BlockStreamHandlerImpl as BlockStreamHandler;
#[cfg(test)]
pub use MockBlockStreamHandlerImpl as BlockStreamHandler;

pub struct BlockStreamHandlerImpl {
    block_streamer_client: BlockStreamerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl BlockStreamHandlerImpl {
    pub async fn connect() -> anyhow::Result<Self> {
        let block_streamer_client = BlockStreamerClient::connect("http://[::1]:10000").await?;

        Ok(Self {
            block_streamer_client,
        })
    }

    pub async fn start(
        &mut self,
        start_block_height: u64,
        account_id: String,
        function_name: String,
        rule: registry_types::MatchingRule,
    ) -> anyhow::Result<()> {
        let rule = match &rule {
            registry_types::MatchingRule::ActionAny {
                affected_account_id,
                status,
            } => Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: affected_account_id.to_owned(),
                status: match status {
                    registry_types::Status::Success => Status::Success.into(),
                    registry_types::Status::Fail => Status::Failure.into(),
                    registry_types::Status::Any => Status::Any.into(),
                },
            }),
            _ => anyhow::bail!("Encountered unsupported indexer rule"),
        };

        let _ = self
            .block_streamer_client
            .start_stream(Request::new(StartStreamRequest {
                start_block_height,
                account_id,
                function_name,
                rule: Some(rule),
            }))
            .await?;

        Ok(())
    }
}
