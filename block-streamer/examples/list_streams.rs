use tonic::Request;

use block_streamer::block_streamer_client::BlockStreamerClient;
use block_streamer::ListStreamsRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = BlockStreamerClient::connect("http://[::1]:10000").await?;

    let response = client
        .list_streams(Request::new(ListStreamsRequest {}))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
