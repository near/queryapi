use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{start_stream_request::Rule, ActionAnyRule, StartStreamRequest, Status};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = BlockStreamerClient::connect("http://[::1]:10000").await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 10101010,
            account_id: "morgs.near".to_string(),
            function_name: "test".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "token.sweat".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    println!("RESPONSE = {:?}", response);

    Ok(())
}
