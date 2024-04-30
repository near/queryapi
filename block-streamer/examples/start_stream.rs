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
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;
    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test1".to_string(),
            version: 0,
            redis_stream: "morgs.near/test1:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test2".to_string(),
            version: 0,
            redis_stream: "morgs.near/test2:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test3".to_string(),
            version: 0,
            redis_stream: "morgs.near/test3:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test4".to_string(),
            version: 0,
            redis_stream: "morgs.near/test4:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test5".to_string(),
            version: 0,
            redis_stream: "morgs.near/test5:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;
    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test6".to_string(),
            version: 0,
            redis_stream: "morgs.near/test6:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test7".to_string(),
            version: 0,
            redis_stream: "morgs.near/test7:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test8".to_string(),
            version: 0,
            redis_stream: "morgs.near/test8:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test9".to_string(),
            version: 0,
            redis_stream: "morgs.near/test9:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    let response = client
        .start_stream(Request::new(StartStreamRequest {
            start_block_height: 106700000,
            account_id: "morgs.near".to_string(),
            function_name: "test10".to_string(),
            version: 0,
            redis_stream: "morgs.near/test10:block_stream".to_string(),
            rule: Some(Rule::ActionAnyRule(ActionAnyRule {
                affected_account_id: "social.near".to_string(),
                status: Status::Success.into(),
            })),
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
