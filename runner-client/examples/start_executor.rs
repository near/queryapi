use tonic::Request;

use runner::runner_client::RunnerClient;
use runner::StartExecutorRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = RunnerClient::connect("http://localhost:50007").await?;

    let response = client
        .start_executor(Request::new(StartExecutorRequest {
            account_id: "morgs.near".to_string(),
            function_name: "test".to_string(),
            code: "console.log('hi')".to_string(),
            schema: "CREATE TABLE blocks()".to_string(),
            redis_stream: "morgs.near/test:block_stream".to_string(),
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
