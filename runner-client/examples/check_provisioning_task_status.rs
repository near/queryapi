use tonic::Request;

use runner::data_layer::data_layer_client::DataLayerClient;
use runner::data_layer::CheckProvisioningTaskStatusRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = DataLayerClient::connect("http://localhost:7001").await?;

    let response = client
        .check_provisioning_task_status(Request::new(CheckProvisioningTaskStatusRequest {
            account_id: "morgs.near".to_string(),
            function_name: "test2".to_string(),
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
