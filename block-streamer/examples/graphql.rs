use graphql_client::{GraphQLQuery, Response};
use std::error::Error;
use reqwest;

#[allow(clippy::upper_case_acronyms)]
type URI = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/bitmap/schema.json",
    query_path = "graphql/bitmap/query.graphql",
    response_derives = "Debug"
)]
struct GetBitmapByDate;

async fn perform_my_query(variables: get_bitmap_by_date::Variables) -> Result<(), Box<dyn Error>> {

    // this is the important line
    let request_body = GetBitmapByDate::build_query(variables);

    let client = reqwest::Client::new();
    let mut res = client.post("/graphql").json(&request_body).send().await?;
    let response_body: Response<get_bitmap_by_date::ResponseData> = res.json().await?;
    println!("{:#?}", response_body);
    Ok(())
}

fn main() -> Result<(), anyhow::Error> {
    let variables = get_bitmap_by_date::Variables {
        block_date: "2024-03-21",
    };
    
}
