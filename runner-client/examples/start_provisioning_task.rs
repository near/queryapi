use tonic::Request;

use runner::data_layer::data_layer_client::DataLayerClient;
use runner::data_layer::ProvisionRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = DataLayerClient::connect("http://localhost:7001").await?;

    let response = client
        .start_provisioning_task(Request::new(ProvisionRequest {
            account_id: "morgs.near".to_string(),
            function_name: "test2".to_string(),
            schema: "create table blocks();".to_string(),
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
