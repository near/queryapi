// TODO: Move to new Coordinator Folder
use runner_client::runner_client::RunnerClient;
use tonic::transport::Channel;

pub mod runner_client {
    tonic::include_proto!("runner");
}

pub async fn create_client() -> Result<RunnerClient<Channel>, tonic::transport::Error> {
    let server_host = std::env::var("RUNNER_HOST").unwrap_or("undefined".to_string());
    let server_port = std::env::var("RUNNER_PORT").unwrap_or("undefined".to_string());
    let server_address = format!("http://{}:{}", server_host, server_port);

    RunnerClient::connect(server_address).await
}
