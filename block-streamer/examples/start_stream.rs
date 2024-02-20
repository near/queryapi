use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{start_stream_request::Rule, ActionAnyRule, StartStreamRequest, Status};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = BlockStreamerClient::connect("http://0.0.0.0:8002").await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test".to_string(),
            version: 0,
            redis_stream: "morgs.near/test:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "*".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
