use crate::bitmap::{Base64Bitmap, BitmapOperator};
use crate::graphql::client::GraphQLClient;
use crate::rules::types::ChainId;
use anyhow::Context;
use async_stream::stream;
use chrono::{DateTime, Duration, TimeZone, Utc};
use futures::stream::{BoxStream, Stream};
use futures::StreamExt;
use near_lake_framework::near_indexer_primitives;

const MAX_S3_RETRY_COUNT: u8 = 20;

#[derive(Debug, Eq, PartialEq)]
enum ContractPatternType {
    Exact(Vec<String>),
    Wildcard(String),
}

pub struct BlockHeightStream {
    graphql_client: GraphQLClient,
    bitmap_operator: BitmapOperator,
    s3_client: crate::s3_client::S3Client,
    chain_id: ChainId,
}

#[cfg_attr(test, mockall::automock)]
impl BlockHeightStream {
    pub fn new(graphql_endpoint: String, s3_client: crate::s3_client::S3Client) -> Self {
        Self {
            graphql_client: GraphQLClient::new(graphql_endpoint),
            bitmap_operator: BitmapOperator::new(),
            s3_client,
            chain_id: ChainId::Mainnet, // Hardcoded mainnet for now
        }
    }

    fn get_lake_bucket(&self) -> String {
        match self.chain_id {
            ChainId::Mainnet => "near-lake-data-mainnet".to_string(),
            ChainId::Testnet => "near-lake-data-testnet".to_string(),
        }
    }

    pub async fn get_nearest_block_date(&self, block_height: u64) -> anyhow::Result<DateTime<Utc>> {
        let mut current_block_height = block_height;
        let mut retry_count = 1;
        loop {
            let block_key = format!("{:0>12}/block.json", current_block_height);
            match self
                .s3_client
                .get_text_file(&self.get_lake_bucket(), &block_key)
                .await
            {
                Ok(text) => {
                    let block: near_indexer_primitives::views::BlockView =
                        serde_json::from_str(&text)?;
                    return Ok(Utc.timestamp_nanos(block.header.timestamp_nanosec as i64));
                }

                Err(e) => {
                    if e.root_cause()
                        .downcast_ref::<aws_sdk_s3::types::error::NoSuchKey>()
                        .is_some()
                    {
                        retry_count += 1;
                        if retry_count > MAX_S3_RETRY_COUNT {
                            anyhow::bail!("Exceeded maximum retries to fetch block from S3");
                        }

                        tracing::debug!(
                            "Block {} not found on S3, attempting to fetch next block",
                            current_block_height
                        );
                        current_block_height += 1;
                        continue;
                    }

                    return Err(e).context("Failed to fetch block from S3");
                }
            }
        }
    }

    fn next_day(date: DateTime<Utc>) -> DateTime<Utc> {
        date + Duration::days(1)
    }

    fn parse_contract_pattern(&self, contract_pattern: &str) -> ContractPatternType {
        let trimmed_contract_pattern: String = contract_pattern
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect();
        if contract_pattern.chars().any(|c| c == '*') {
            let wildcard_pattern = trimmed_contract_pattern
                .replace(',', "|")
                .replace('.', "\\.")
                .replace('*', ".*");
            return ContractPatternType::Wildcard(wildcard_pattern);
        }

        let exact_pattern = trimmed_contract_pattern
            .split(',')
            .map(str::to_string)
            .collect();
        ContractPatternType::Exact(exact_pattern)
    }

    fn generate_block_height_stream(&self) -> impl Stream<Item = usize> {
        stream! {
            for i in 0..3 {
                yield i;
            }
        }
    }

    pub async fn list_matching_block_heights(
        &self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        contract_pattern: &str,
    ) -> anyhow::Result<BoxStream<'static, usize>> {
        let start_date = self.get_nearest_block_date(start_block_height).await?;
        let contract_pattern_type = self.parse_contract_pattern(contract_pattern);

        Ok(self.generate_block_height_stream().boxed())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASURA_ENDPOINT: &str =
        "https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql";

    #[test]
    fn parse_exact_contract_patterns() {
        let mock_s3_client = crate::s3_client::S3Client::default();
        let block_height_stream =
            BlockHeightStream::new(HASURA_ENDPOINT.to_owned(), mock_s3_client);
        let sample_patterns = vec![
            "near",
            "near, someone.tg",
            "a.near, b.near, a.b, a.b.c.near",
        ];

        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[0]),
            ContractPatternType::Exact(vec!["near".to_string()])
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[1]),
            ContractPatternType::Exact(vec!["near".to_string(), "someone.tg".to_string()],)
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[2]),
            ContractPatternType::Exact(vec![
                "a.near".to_string(),
                "b.near".to_string(),
                "a.b".to_string(),
                "a.b.c.near".to_string(),
            ])
        );
    }

    #[test]
    fn parse_wildcard_contract_patterns() {
        let mock_s3_client = crate::s3_client::S3Client::default();
        let block_height_stream =
            BlockHeightStream::new(HASURA_ENDPOINT.to_owned(), mock_s3_client);
        let sample_patterns = vec![
            "*.near",
            "near, someone.*.tg",
            "a.near, b.*, *.b, a.*.c.near",
        ];

        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[0]),
            ContractPatternType::Wildcard(".*\\.near".to_string())
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[1]),
            ContractPatternType::Wildcard("near|someone\\..*\\.tg".to_string())
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[2]),
            ContractPatternType::Wildcard("a\\.near|b\\..*|.*\\.b|a\\..*\\.c\\.near".to_string())
        );
    }

    #[test]
    fn collect_three_block_heights_from_one_bitmap() {}

    #[test]
    fn collect_three_block_heights_from_two_bitmaps() {}
}
