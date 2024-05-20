use graphql_client::{GraphQLQuery, Response};
use std::error::Error;
use ::reqwest::blocking::Client;

#[allow(clippy::upper_case_acronyms)]
type URI = String;
type Date = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/bitmap/schema.json",
    query_path = "graphql/bitmap/query.graphql",
    response_derives = "Debug",
    normalization = "rust"
)]
struct GetBitmapByDate;

fn perform_my_query(variables: get_bitmap_by_date::Variables) -> Result<(), Box<dyn Error>> {

    // this is the important line
    let request_body = GetBitmapByDate::build_query(variables);

    let client = reqwest::blocking::Client::new();
    let res = client.post("https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql").header("x-hasura-role", "darunrs_near").json(&request_body).send()?;
    let response_body: Response<get_bitmap_by_date::ResponseData> = res.json()?;
    println!("{:#?}", response_body);
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let variables = get_bitmap_by_date::Variables {
        block_date: Some("2024-03-21".to_string()),
        limit: Some(100),
        offset: Some(0),
    };
    perform_my_query(variables)
}
