use anyhow::Context;
use async_stream::try_stream;
use chrono::{DateTime, Duration, TimeZone, Utc};
use near_lake_framework::near_indexer_primitives;
use regex::Regex;

use crate::graphql::client::GraphQLClient;
use crate::rules::types::ChainId;

use super::bitmap::{Base64Bitmap, CompressedBitmap, DecompressedBitmap};

const MAX_S3_RETRY_COUNT: u8 = 20;

#[derive(Debug, Eq, PartialEq)]
enum ContractPatternType {
    Exact(Vec<String>),
    Wildcard(String),
}

impl ContractPatternType {
    fn strip_wildcard_if_root_account(receiver_id: String) -> anyhow::Result<String> {
        let wildcard_root_account_regex = Regex::new(r"^\*\.([a-zA-Z0-9]+)$")?;
        if wildcard_root_account_regex.is_match(&receiver_id) {
            return Ok(receiver_id
                .split('.')
                .nth(1)
                .unwrap_or(&receiver_id)
                .to_string());
        }
        Ok(receiver_id)
    }
}

impl From<&str> for ContractPatternType {
    fn from(contract_pattern: &str) -> Self {
        // If receiver_id is of pattern *.SOME_ROOT_ACCOUNT such as *.near, we can reduce this to
        // "near" as we store bitmaps for root accounts like near ,tg, and so on.
        let cleaned_contract_pattern: String = contract_pattern
            .split(',')
            .map(|receiver| receiver.trim())
            .map(str::to_string)
            .map(|receiver| {
                ContractPatternType::strip_wildcard_if_root_account(receiver.clone())
                    .unwrap_or(receiver)
            })
            .collect::<Vec<String>>()
            .join(",");

        if cleaned_contract_pattern.chars().any(|c| c == '*') {
            let wildcard_pattern = cleaned_contract_pattern
                .replace(',', "|")
                .replace('.', "\\.")
                .replace('*', ".*");
            return ContractPatternType::Wildcard(wildcard_pattern);
        }

        let exact_pattern = cleaned_contract_pattern
            .split(',')
            .map(str::to_string)
            .collect();
        ContractPatternType::Exact(exact_pattern)
    }
}

pub struct ReceiverBlocksProcessor {
    graphql_client: GraphQLClient,
    s3_client: crate::s3_client::S3Client,
    chain_id: ChainId,
}

impl ReceiverBlocksProcessor {
    pub fn new(graphql_client: GraphQLClient, s3_client: crate::s3_client::S3Client) -> Self {
        Self {
            graphql_client,
            s3_client,
            chain_id: ChainId::Mainnet,
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

    fn next_day(&self, date: DateTime<Utc>) -> DateTime<Utc> {
        date + Duration::days(1)
    }

    async fn query_base_64_bitmaps(
        &self,
        contract_pattern_type: &ContractPatternType,
        current_date: &DateTime<Utc>,
    ) -> anyhow::Result<Vec<Base64Bitmap>> {
        match contract_pattern_type {
            ContractPatternType::Exact(ref pattern) => {
                let query_result: Vec<_> = self
                    .graphql_client
                    .get_bitmaps_exact(pattern.clone(), current_date)
                    .await?;
                Ok(query_result
                    .iter()
                    .map(Base64Bitmap::try_from)
                    .collect::<anyhow::Result<Vec<_>>>()?)
            }
            ContractPatternType::Wildcard(ref pattern) => {
                let query_result: Vec<_> = self
                    .graphql_client
                    .get_bitmaps_wildcard(pattern.clone(), current_date)
                    .await?;
                Ok(query_result
                    .iter()
                    .map(Base64Bitmap::try_from)
                    .collect::<anyhow::Result<Vec<_>>>()?)
            }
        }
    }

    pub fn stream_matching_block_heights<'b, 'a: 'b>(
        &'a self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        contract_pattern: String,
    ) -> impl futures::Stream<Item = anyhow::Result<u64>> + 'b {
        try_stream! {
            let start_date = self.get_nearest_block_date(start_block_height).await?;
            let contract_pattern_type = ContractPatternType::from(contract_pattern.as_str());
            let mut current_date = start_date;

            while current_date <= Utc::now() {
                let base_64_bitmaps: Vec<Base64Bitmap> = self.query_base_64_bitmaps(&contract_pattern_type, &current_date).await?;

                if base_64_bitmaps.is_empty() {
                    current_date = self.next_day(current_date);
                    continue;
                }

                let compressed_bitmaps: Vec<_> = base_64_bitmaps.iter().map(CompressedBitmap::try_from).collect()?;
                let decompressed_bitmaps: Vec<_> = compressed_bitmaps.iter().map(CompressedBitmap::decompress).collect()?;

                let starting_block_height: u64 = decompressed_bitmaps.iter().map(|item| item.start_block_height).min().unwrap_or(decompressed_bitmaps[0].start_block_height);

                let mut bitmap_for_day = DecompressedBitmap::new(starting_block_height, None);
                for bitmap in decompressed_bitmaps {
                    bitmap_for_day.merge(bitmap)?;
                }

                for block_height in bitmap_for_day.iter() {
                    yield block_height;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate;

    use futures::StreamExt;

    fn exact_query_result(
        first_block_height: i64,
        bitmap: &str,
    ) -> crate::graphql::client::get_bitmaps_exact::GetBitmapsExactDataplatformNearReceiverBlocksBitmaps
    {
        crate::graphql::client::get_bitmaps_exact::GetBitmapsExactDataplatformNearReceiverBlocksBitmaps {
            first_block_height,
            bitmap: bitmap.to_string(),
        }
    }

    fn wildcard_query_result(
        first_block_height: i64,
        bitmap: &str
    ) -> crate::graphql::client::get_bitmaps_wildcard::GetBitmapsWildcardDataplatformNearReceiverBlocksBitmaps{
        crate::graphql::client::get_bitmaps_wildcard::GetBitmapsWildcardDataplatformNearReceiverBlocksBitmaps {
            first_block_height,
            bitmap: bitmap.to_string(),
        }
    }

    #[test]
    fn parse_exact_contract_patterns() {
        let sample_patterns = [
            "near",
            "*.near",
            "near, someone.tg",
            "*.near, someone.tg, *.tg",
            "a.near, b.near, a.b, a.b.c.near",
        ];

        assert_eq!(
            ContractPatternType::from(sample_patterns[0]),
            ContractPatternType::Exact(vec!["near".to_string()])
        );
        assert_eq!(
            ContractPatternType::from(sample_patterns[1]),
            ContractPatternType::Exact(vec!["near".to_string()])
        );
        assert_eq!(
            ContractPatternType::from(sample_patterns[2]),
            ContractPatternType::Exact(vec!["near".to_string(), "someone.tg".to_string()],)
        );
        assert_eq!(
            ContractPatternType::from(sample_patterns[3]),
            ContractPatternType::Exact(vec![
                "near".to_string(),
                "someone.tg".to_string(),
                "tg".to_string()
            ],)
        );
        assert_eq!(
            ContractPatternType::from(sample_patterns[4]),
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
        let sample_patterns = [
            "*.someone.near",
            "near, someone.*.tg",
            "a.near, b.*, *.b, a.*.c.near",
        ];

        assert_eq!(
            ContractPatternType::from(sample_patterns[0]),
            ContractPatternType::Wildcard(".*\\.someone\\.near".to_string())
        );
        assert_eq!(
            ContractPatternType::from(sample_patterns[1]),
            ContractPatternType::Wildcard("near|someone\\..*\\.tg".to_string())
        );
        assert_eq!(
            ContractPatternType::from(sample_patterns[2]),
            ContractPatternType::Wildcard("a\\.near|b\\..*|b|a\\..*\\.c\\.near".to_string())
        );
    }

    #[tokio::test]
    async fn collect_block_heights_from_one_day() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();
        mock_s3_client
            .expect_get_text_file()
            .returning(move |_, _| {
                Ok(crate::test_utils::generate_block_with_timestamp(
                    &Utc::now().format("%Y-%m-%d").to_string(),
                ))
            });

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();
        let mock_query_result_item = exact_query_result(1, "wA==");
        let mock_query_result = vec![mock_query_result_item];
        mock_graphql_client
            .expect_get_bitmaps_exact()
            .with(
                predicate::eq(vec!["someone.near".to_string()]),
                predicate::function(|date: &DateTime<Utc>| {
                    date.date_naive() == Utc::now().date_naive()
                }),
            )
            .times(1)
            .returning(move |_, _| Ok(mock_query_result.clone()));

        let reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);

        let stream =
            reciever_blocks_processor.stream_matching_block_heights(0, "someone.near".to_owned());
        tokio::pin!(stream);
        let mut result_heights = vec![];
        while let Some(Ok(height)) = stream.next().await {
            result_heights.push(height);
        }
        assert_eq!(result_heights, vec![1]);
    }

    #[tokio::test]
    async fn collect_block_heights_from_past_three_days() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();
        mock_s3_client
            .expect_get_text_file()
            .returning(move |_, _| {
                Ok(crate::test_utils::generate_block_with_timestamp(
                    &(Utc::now() - Duration::days(2))
                        .format("%Y-%m-%d")
                        .to_string(),
                ))
            });

        let mut mock_graphql_client = crate::graphql::client::GraphQLClient::default();
        mock_graphql_client
            .expect_get_bitmaps_wildcard()
            .with(
                predicate::eq(".*\\.someone\\.near".to_string()),
                predicate::function(|date: &DateTime<Utc>| {
                    date.date_naive() == (Utc::now() - Duration::days(2)).date_naive()
                }),
            )
            .returning(move |_, _| {
                Ok(vec![
                    wildcard_query_result(1, "wA=="),
                    wildcard_query_result(5, "wA=="),
                ])
            })
            .once();
        mock_graphql_client
            .expect_get_bitmaps_wildcard()
            .with(
                predicate::eq(".*\\.someone\\.near".to_string()),
                predicate::function(|date: &DateTime<Utc>| {
                    date.date_naive() == (Utc::now() - Duration::days(1)).date_naive()
                }),
            )
            .returning(move |_, _| {
                Ok(vec![
                    wildcard_query_result(10, "wA=="),
                    wildcard_query_result(15, "wA=="),
                ])
            })
            .once();
        mock_graphql_client
            .expect_get_bitmaps_wildcard()
            .with(
                predicate::eq(".*\\.someone\\.near".to_string()),
                predicate::function(|date: &DateTime<Utc>| {
                    date.date_naive() == Utc::now().date_naive()
                }),
            )
            .returning(move |_, _| {
                Ok(vec![
                    wildcard_query_result(100, "wA=="),
                    wildcard_query_result(105, "wA=="),
                ])
            })
            .once();
        let reciever_blocks_processor =
            ReceiverBlocksProcessor::new(mock_graphql_client, mock_s3_client);

        let stream = reciever_blocks_processor
            .stream_matching_block_heights(0, "*.someone.near".to_string());
        tokio::pin!(stream);
        let mut result_heights = vec![];
        while let Some(Ok(height)) = stream.next().await {
            result_heights.push(height);
        }
        assert_eq!(result_heights, vec![1, 5, 10, 15, 100, 105]);
    }
}
