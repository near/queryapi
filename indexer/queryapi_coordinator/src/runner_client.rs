use runner_client::runner_client::RunnerClient;
use tonic::transport::Channel;

pub mod runner_client {
  tonic::include_proto!("runner");
}

pub async fn create_client(server_url: &str) -> Result<RunnerClient<Channel>, tonic::transport::Error> {
    RunnerClient::connect(server_url.to_string()).await
}