use crate::graphql_queries::get_bitmaps_exact::{get_bitmaps_exact, GetBitmapsExact};
use crate::graphql_queries::get_bitmaps_wildcard::{get_bitmaps_wildcard, GetBitmapsWildcard};
use ::reqwest;
use graphql_client::{GraphQLQuery, Response};
use std::error::Error;

const HASURA_ACCOUNT: &str = "darunrs_near";

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

    pub async fn get_bitmaps_exact(
        &self,
        receiver_ids: Vec<String>,
        block_date: String,
        limit: i64,
        offset: i64,
    ) -> Result<Response<get_bitmaps_exact::ResponseData>, Box<dyn Error>> {
        let variables = get_bitmaps_exact::Variables {
            receiver_ids: Some(receiver_ids),
            block_date: Some(block_date),
            limit: Some(limit),
            offset: Some(offset),
        };
        let request_body = GetBitmapsExact::build_query(variables);
        let res = self
            .client
            .post(&self.graphql_endpoint)
            .header("x-hasura-role", HASURA_ACCOUNT)
            .json(&request_body)
            .send()
            .await
            .expect("Failed to query bitmaps for list of exact receivers");
        let response_body: Response<get_bitmaps_exact::ResponseData> = res.json().await?;
        Ok(response_body)
    }

    pub async fn get_bitmaps_wildcard(
        &self,
        receiver_ids: String,
        block_date: String,
        limit: i64,
        offset: i64,
    ) -> Result<Response<get_bitmaps_wildcard::ResponseData>, Box<dyn Error>> {
        let variables = get_bitmaps_wildcard::Variables {
            receiver_ids: Some(receiver_ids),
            block_date: Some(block_date),
            limit: Some(limit),
            offset: Some(offset),
        };
        let request_body = GetBitmapsWildcard::build_query(variables);
        let res = self
            .client
            .post(&self.graphql_endpoint)
            .header("x-hasura-role", HASURA_ACCOUNT)
            .json(&request_body)
            .send()
            .await
            .expect("Failed to query bitmaps for wildcard receivers");
        let response_body: Response<get_bitmaps_wildcard::ResponseData> = res.json().await?;
        Ok(response_body)
    }
}

// TODO: Add Unit Tests
