use crate::graphql::queries::get_bitmaps_exact::{get_bitmaps_exact, GetBitmapsExact};
use crate::graphql::queries::get_bitmaps_wildcard::{get_bitmaps_wildcard, GetBitmapsWildcard};
use ::reqwest;
use graphql_client::{GraphQLQuery, Response};
use std::error::Error;

// TODO: Use Dataplatform account
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
    ) -> Result<
        Vec<get_bitmaps_exact::GetBitmapsExactDarunrsNearBitmapV5ActionsIndex>,
        Box<dyn Error>,
    > {
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
        match response_body.data {
            Some(data) => Ok(data.darunrs_near_bitmap_v5_actions_index),
            None => Ok([].into()),
        }
    }

    pub async fn get_bitmaps_wildcard(
        &self,
        receiver_ids: String,
        block_date: String,
        limit: i64,
        offset: i64,
    ) -> Result<
        Vec<get_bitmaps_wildcard::GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex>,
        Box<dyn Error>,
    > {
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
        match response_body.data {
            Some(data) => Ok(data.darunrs_near_bitmap_v5_actions_index),
            None => Ok([].into()),
        }
    }
}

// TODO: Remove Unit tests after bitmap query is integrated into the main application
#[cfg(test)]
mod tests {
    use super::*;

    const HASURA_ENDPOINT: &str =
        "https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql";

    #[tokio::test]
    async fn test_get_bitmaps_exact() {
        let client = GraphqlClient::new(HASURA_ENDPOINT.to_string());
        let receiver_ids = vec!["app.nearcrowd.near".to_string()];
        let block_date = "2024-03-21".to_string();
        let limit = 10;
        let offset = 0;
        let response = client
            .get_bitmaps_exact(receiver_ids, block_date, limit, offset)
            .await
            .unwrap();
        assert_eq!(response[0].first_block_height, 115130287);
    }

    // This query takes several seconds
    #[ignore]
    #[tokio::test]
    async fn test_get_bitmaps_wildcard() {
        let client = GraphqlClient::new(HASURA_ENDPOINT.to_string());
        let receiver_ids = "app.nearcrowd.near".to_string();
        let block_date = "2024-03-21".to_string();
        let limit = 10;
        let offset = 0;
        let response = client
            .get_bitmaps_wildcard(receiver_ids, block_date, limit, offset)
            .await
            .unwrap();
        assert_eq!(response[0].first_block_height, 115130287);
    }
}
