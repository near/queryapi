use graphql_client::{GraphQLQuery, Response};
use std::error::Error;
use ::reqwest;

const HASURA_ACCOUNT: &str = "darunrs_near";

#[allow(clippy::upper_case_acronyms)]
type Date = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/darunrs_near/schema.json",
    query_path = "graphql/darunrs_near/get_bitmaps.graphql",
    response_derives = "Debug",
    normalization = "rust"
)]
struct GetBitmaps;

pub struct GraphqlClient {
    client: reqwest::Client,
    graphql_endpoint: String,
}

#[cfg_attr(test, mockall::automock)]
impl GraphqlClient {
    pub fn new(graphql_endpoint: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            graphql_endpoint,
        }
    }

    pub async fn get_bitmaps(&self, receiver_ids: String, block_date: String, limit: i64, offset: i64) -> Result<(), Box<dyn Error>> {
        let variables = get_bitmaps::Variables {
            receiver_ids: Some(receiver_ids),
            block_date: Some(block_date),
            limit: Some(limit),
            offset: Some(offset),
        };
        let request_body = GetBitmaps::build_query(variables);
        let res = self.client.post(&self.graphql_endpoint).header("x-hasura-role", HASURA_ACCOUNT).json(&request_body).send().await?;
        let response_body: Response<get_bitmaps::ResponseData> = res.json().await?;
        println!("{:#?}", response_body);
        Ok(())
    }
}
