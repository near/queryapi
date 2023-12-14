use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::StopStreamRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = BlockStreamerClient::connect("http://[::1]:10000").await?;

    let response = client
        .stop_stream(Request::new(StopStreamRequest {
            // ID for indexer morgs.near/test
            stream_id: "16210176318434468568".to_string(),
        }))
        .await?;

    println!("RESPONSE = {:?}", response);

    Ok(())
}
