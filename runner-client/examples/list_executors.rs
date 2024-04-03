use tonic::Request;

use runner::runner_client::RunnerClient;
use runner::ListExecutorsRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = RunnerClient::connect("http://localhost:7001").await?;

    let response = client
        .list_executors(Request::new(ListExecutorsRequest {}))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
