// TODO: Remove this file when working query to production bitmap indexer is ready
use block_streamer::graphql;

use std::error::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let client = graphql::GraphqlClient::new(
        "https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql".to_string(),
    );

    let exact_query = client
        .get_bitmaps_exact(
            vec!["app.nearcrowd.near".to_owned()],
            "2024-03-21".to_string(),
            100,
            0,
        )
        .await;
    println!("exact query: {:#?}", exact_query);

    let wildcard_query = client
        .get_bitmaps_wildcard(
            "app.nearcrowd.near".to_string(),
            "2024-03-21".to_string(),
            100,
            0,
        )
        .await;
    println!("wildcard query: {:#?}", wildcard_query);
    Ok(())
}
