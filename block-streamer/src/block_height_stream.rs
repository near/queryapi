use crate::bitmap::{Base64Bitmap, BitmapOperator};
use crate::graphql::client::GraphQLClient;
use async_stream::stream;
use futures::Stream;
use near_lake_framework::near_indexer_primitives;

pub struct BlockHeightStream {
    graphql_client: GraphQLClient,
    bitmap_operator: BitmapOperator,
}

#[cfg_attr(test, mockall::automock)]
impl BlockHeightStream {
    pub fn new(graphql_endpoint: String) -> Self {
        Self {
            graphql_client: GraphQLClient::new(graphql_endpoint),
            bitmap_operator: BitmapOperator::new(),
        }
    }

    fn parse_contract_pattern(&self, contract_pattern: &str) -> Vec<

    pub async fn list_matching_block_heights(
        &self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        contract_pattern: &str,
    ) -> impl Stream<Item = usize> {
        let start_date = self.get_nearest_block_date(start_block_height).await?;
        
        stream! {
            for i in 0..3 {
                yield i;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASURA_ENDPOINT: &str =
        "https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql";

    fn collect_three_block_heights_from_one_bitmap() {}

    fn collect_three_block_heights_from_two_bitmaps() {}
}
