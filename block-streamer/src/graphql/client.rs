use ::reqwest;
use graphql_client::{GraphQLQuery, Response};
use std::error::Error;

// TODO: Use Dataplatform account
const HASURA_ACCOUNT: &str = "darunrs_near";

#[allow(clippy::upper_case_acronyms)]
type Date = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/darunrs_near/schema.graphql",
    query_path = "graphql/darunrs_near/get_bitmaps_exact.graphql",
    response_derives = "Debug",
    normalization = "rust"
)]
struct GetBitmapsExact;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/darunrs_near/schema.graphql",
    query_path = "graphql/darunrs_near/get_bitmaps_wildcard.graphql",
    response_derives = "Debug",
    normalization = "rust"
)]
struct GetBitmapsWildcard;

pub struct GraphQLClient {
    client: reqwest::Client,
    graphql_endpoint: String,
}

async fn post_graphql<Q: GraphQLQuery, U: reqwest::IntoUrl>(
    client: &reqwest::Client,
    url: U,
    variables: Q::Variables,
) -> Result<Response<Q::ResponseData>, reqwest::Error> {
    let body = Q::build_query(variables);
    let reqwest_response = client
        .post(url)
        .header("x-hasura-role", HASURA_ACCOUNT)
        .json(&body)
        .send()
        .await?;

    reqwest_response.json().await
}

#[cfg_attr(test, mockall::automock)]
impl GraphQLClient {
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
    ) -> anyhow::Result<Vec<get_bitmaps_exact::GetBitmapsExactDarunrsNearBitmapV5ActionsIndex>>
    {
        post_graphql::<GetBitmapsExact, _>(
            &self.client,
            &self.graphql_endpoint,
            get_bitmaps_exact::Variables {
                receiver_ids: Some(receiver_ids),
                block_date: Some(block_date),
                limit: Some(limit),
                offset: Some(offset),
            },
        )
        .await
        .expect("Failed to query bitmaps for list of exact receivers")
        .data
        .ok_or(anyhow::anyhow!("No bitmaps were returned"))
        .map(|data| data.darunrs_near_bitmap_v5_actions_index)
    }

    pub async fn get_bitmaps_wildcard(
        &self,
        receiver_ids: String,
        block_date: String,
        limit: i64,
        offset: i64,
    ) -> anyhow::Result<Vec<get_bitmaps_wildcard::GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex>>
    {
        post_graphql::<GetBitmapsWildcard, _>(
            &self.client,
            &self.graphql_endpoint,
            get_bitmaps_wildcard::Variables {
                receiver_ids: Some(receiver_ids),
                block_date: Some(block_date),
                limit: Some(limit),
                offset: Some(offset),
            },
        )
        .await
        .expect("Failed to query bitmaps for list of wildcard receivers")
        .data
        .ok_or(anyhow::anyhow!("No bitmaps were returned"))
        .map(|data| data.darunrs_near_bitmap_v5_actions_index)
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
        let client = GraphQLClient::new(HASURA_ENDPOINT.to_string());
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
        let client = GraphQLClient::new(HASURA_ENDPOINT.to_string());
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
