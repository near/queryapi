use tonic::{Request, Response, Status};

use crate::server::blockstreamer;

#[derive(Debug)]
pub struct BlockStreamerService {}

#[tonic::async_trait]
impl blockstreamer::block_streamer_server::BlockStreamer for BlockStreamerService {
    async fn start_stream(
        &self,
        request: Request<blockstreamer::StartStreamRequest>,
    ) -> Result<Response<blockstreamer::StartStreamResponse>, Status> {
        println!("StartStream = {:?}", request);
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
