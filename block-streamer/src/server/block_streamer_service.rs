use tonic::{Request, Response, Status};

use crate::indexer_config::IndexerConfig;
use crate::rules::types::indexer_rule_match::ChainId;
use crate::rules::{IndexerRule, IndexerRuleKind, MatchingRule};

use crate::block_stream;
use crate::server::blockstreamer;

#[derive(Debug)]
pub struct BlockStreamerService {}

#[tonic::async_trait]
impl blockstreamer::block_streamer_server::BlockStreamer for BlockStreamerService {
    async fn start_stream(
        &self,
        request: Request<blockstreamer::StartStreamRequest>,
    ) -> Result<Response<blockstreamer::StartStreamResponse>, Status> {
        let request = request.into_inner();
        let matching_rule = match request.rule.unwrap() {
            start_stream_request::Rule::ActionAnyRule(action_any_rule) => {
                let affected_account_id = action_any_rule.affected_account_id;
                let status = match action_any_rule.status {
                    _ => crate::rules::Status::Success,
                };
                MatchingRule::ActionAny {
                    affected_account_id,
                    status,
                }
            }
            _ => unimplemented!(),
        };
        let filter_rule = IndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule,
            id: None,
            name: None,
        };
        let indexer = IndexerConfig {
            account_id: request.account_id.parse().expect("Invalid account id"),
            function_name: request.function_name,
            code: "".to_string(),
            start_block_height: Some(request.start_block_height),
            schema: None,
            provisioned: false,
            indexer_rule: filter_rule,
        };
        println!("StopStream = {:?}", indexer);
        Ok(Response::new(blockstreamer::StartStreamResponse::default()))
    }

    async fn stop_stream(
        &self,
        request: Request<blockstreamer::StopStreamRequest>,
    ) -> Result<Response<blockstreamer::StopStreamResponse>, Status> {
        println!("StopStream = {:?}", request);
        Ok(Response::new(blockstreamer::StopStreamResponse::default()))
    }

    async fn list_streams(
        &self,
        request: Request<blockstreamer::ListStreamsRequest>,
    ) -> Result<Response<blockstreamer::ListStreamsResponse>, Status> {
        println!("ListStreams = {:?}", request);
        Ok(Response::new(blockstreamer::ListStreamsResponse::default()))
    }
}
