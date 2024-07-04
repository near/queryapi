use ::reqwest;
use chrono::{DateTime, Utc};
use graphql_client::{GraphQLQuery, Response};

const HASURA_ACCOUNT: &str = "dataplatform_near";
const QUERY_LIMIT: i64 = 1000;

#[allow(clippy::upper_case_acronyms)]
type Date = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/dataplatform_near/schema.graphql",
    query_path = "graphql/dataplatform_near/get_bitmaps_exact.graphql",
    response_derives = "Debug,Clone",
    normalization = "rust"
)]
pub struct GetBitmapsExact;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/dataplatform_near/schema.graphql",
    query_path = "graphql/dataplatform_near/get_bitmaps_wildcard.graphql",
    response_derives = "Debug,Clone",
    normalization = "rust"
)]
pub struct GetBitmapsWildcard;

#[cfg(not(test))]
pub use GraphQLClientImpl as GraphQLClient;
#[cfg(test)]
pub use MockGraphQLClientImpl as GraphQLClient;

pub struct GraphQLClientImpl {
    client: reqwest::Client,
    graphql_endpoint: String,
}

#[cfg_attr(test, mockall::automock)]
impl GraphQLClientImpl {
    pub fn new(graphql_endpoint: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            graphql_endpoint,
        }
    }

    async fn post_graphql<Q: GraphQLQuery + 'static>(
        &self,
        variables: Q::Variables,
    ) -> Result<Response<Q::ResponseData>, reqwest::Error> {
        let body = Q::build_query(variables);
        let reqwest_response = self
            .client
            .post(&self.graphql_endpoint)
            .header("x-hasura-role", HASURA_ACCOUNT)
            .json(&body)
            .send()
            .await?;

        reqwest_response.json().await
    }

    pub async fn get_bitmaps_exact(
        &self,
        receiver_ids: Vec<String>,
        block_date: &DateTime<Utc>,
    ) -> anyhow::Result<Vec<get_bitmaps_exact::GetBitmapsExactDataplatformNearReceiverBlocksBitmaps>>
    {
        let mut all_query_results: Vec<
            get_bitmaps_exact::GetBitmapsExactDataplatformNearReceiverBlocksBitmaps,
        > = vec![];
        let mut offset = 0;
        let mut has_more = true;

        while has_more {
            let mut query_result = self
                .post_graphql::<GetBitmapsExact>(get_bitmaps_exact::Variables {
                    receiver_ids: Some(receiver_ids.clone()),
                    block_date: Some(block_date.format("%Y-%m-%d").to_string()),
                    limit: Some(QUERY_LIMIT),
                    offset: Some(offset),
                })
                .await?
                .data
                .ok_or(anyhow::anyhow!(
                    "Query response is malformed. Missing data field."
                ))
                .map(|data| data.dataplatform_near_receiver_blocks_bitmaps)?;

            has_more = query_result.len() >= QUERY_LIMIT as usize;
            offset += QUERY_LIMIT;

            all_query_results.append(&mut query_result);
        }

        Ok(all_query_results)
    }

    pub async fn get_bitmaps_wildcard(
        &self,
        receiver_ids: String,
        block_date: &DateTime<Utc>,
    ) -> anyhow::Result<
        Vec<get_bitmaps_wildcard::GetBitmapsWildcardDataplatformNearReceiverBlocksBitmaps>,
    > {
        let mut all_query_results: Vec<
            get_bitmaps_wildcard::GetBitmapsWildcardDataplatformNearReceiverBlocksBitmaps,
        > = vec![];
        let mut offset = 0;
        let mut has_more = true;
        while has_more {
            let mut query_result = self
                .post_graphql::<GetBitmapsWildcard>(get_bitmaps_wildcard::Variables {
                    receiver_ids: Some(receiver_ids.clone()),
                    block_date: Some(block_date.format("%Y-%m-%d").to_string()),
                    limit: Some(QUERY_LIMIT),
                    offset: Some(offset),
                })
                .await?
                .data
                .ok_or(anyhow::anyhow!(
                    "Query response is malformed. Missing data field."
                ))
                .map(|data| data.dataplatform_near_receiver_blocks_bitmaps)?;

            has_more = query_result.len() >= QUERY_LIMIT as usize;
            offset += QUERY_LIMIT;

            all_query_results.append(&mut query_result);
        }

        Ok(all_query_results)
    }
}

// TODO: Remove Unit tests after bitmap query is integrated into the main application
#[cfg(test)]
mod tests {
    use chrono::{NaiveDateTime, TimeZone};

    use super::*;

    const HASURA_ENDPOINT: &str =
        "https://queryapi-hasura-graphql-mainnet-24ktefolwq-ew.a.run.app/v1/graphql";

    fn utc_date_time_from_date_string(date: &str) -> DateTime<Utc> {
        let naive_date_time: NaiveDateTime = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        TimeZone::from_utc_datetime(&chrono::Utc, &naive_date_time)
    }

    #[tokio::test]
    async fn test_get_bitmaps_exact() {
        let client = GraphQLClientImpl::new(HASURA_ENDPOINT.to_string());
        let receiver_ids = vec!["app.nearcrowd.near".to_string()];
        let block_date: DateTime<Utc> = utc_date_time_from_date_string("2024-03-21");
        let response = client
            .get_bitmaps_exact(receiver_ids, &block_date)
            .await
            .unwrap();
        assert_eq!(response[0].first_block_height, 115130287);
    }

    // This query takes several seconds
    #[ignore]
    #[tokio::test]
    async fn test_get_bitmaps_wildcard() {
        let client = GraphQLClientImpl::new(HASURA_ENDPOINT.to_string());
        let receiver_ids = "app.nearcrowd.near".to_string();
        let block_date: DateTime<Utc> = utc_date_time_from_date_string("2024-03-21");
        let response = client
            .get_bitmaps_wildcard(receiver_ids, &block_date)
            .await
            .unwrap();
        assert_eq!(response[0].first_block_height, 115130287);
    }
}
