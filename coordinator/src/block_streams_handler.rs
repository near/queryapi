use tonic::transport::channel::Channel;
use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{start_stream_request::Rule, ActionAnyRule, StartStreamRequest, Status};

#[cfg(not(test))]
pub use BlockStreamsHandlerImpl as BlockStreamsHandler;
#[cfg(test)]
pub use MockBlockStreamsHandlerImpl as BlockStreamsHandler;

pub struct BlockStreamsHandlerImpl {
    client: BlockStreamerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl BlockStreamsHandlerImpl {
    pub async fn connect() -> anyhow::Result<Self> {
        let client = BlockStreamerClient::connect("http://[::1]:10000").await?;

        Ok(Self { client })
    }

    pub async fn start(
        &mut self,
        start_block_height: u64,
        account_id: String,
        function_name: String,
        version: u64,
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
            .client
            .start_stream(Request::new(StartStreamRequest {
                start_block_height,
                account_id,
                function_name,
                version,
                rule: Some(rule),
            }))
            .await?;

        Ok(())
    }
}
