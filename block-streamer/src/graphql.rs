#[allow(clippy::upper_case_acronyms)]
type URI = String;
type Date = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "graphql/darunrs_near/schema.json",
    query_path = "graphql/darunrs_near/get_bitmap_by_date.graphql",
    response_derives = "Debug",
    normalization = "rust"
)]
struct GetBitmapsByDateAndId;

pub struct GraphqlClient {
    client: reqwest::Client,
    graphql_endpoint: URI,
}

#[cfg(not(test))]
pub use GraphqlClientImpl as GraphqlClient;
#[cfg(test)]
pub use MockGraphqlClientImpl as GraphqlClient;

#[cfg_attr(test, mockall::automock)]
impl GraphqlClientImpl {
    pub fn new (graphql_endpoint: URI) -> Self {
        Self {
            client: reqwest::Client::new(),
            graphql_endpoint,
        }
    }

    
}
