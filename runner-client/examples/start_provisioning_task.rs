use tonic::Request;

use runner::data_layer::data_layer_client::DataLayerClient;
use runner::data_layer::DeprovisionRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = DataLayerClient::connect("http://localhost:7001").await?;

    let response = client
        .start_deprovisioning_task(Request::new(DeprovisionRequest {
            account_id: "bucanero.near".to_string(),
            function_name: "nft_v4".to_string(),
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
