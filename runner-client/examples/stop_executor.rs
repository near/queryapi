use tonic::Request;

use runner::runner_client::RunnerClient;
use runner::StopExecutorRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = RunnerClient::connect("http://localhost:50007").await?;

    let response = client
        .stop_executor(Request::new(StopExecutorRequest {
            // Deterministic ID for morgs.near/test
            executor_id: "be21b48c307671c1b3768ed84439f736c1cbbd77f815986354e855d44efd16e6"
                .to_string(),
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
