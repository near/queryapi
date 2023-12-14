use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::{start_stream_request::Rule, ActionAnyRule, ListStreamsRequest, Status};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = BlockStreamerClient::connect("http://[::1]:10000").await?;

    let response = client
        .list_streams(Request::new(ListStreamsRequest {}))
        .await?;

    println!("RESPONSE = {:#?}", response);

    Ok(())
}
