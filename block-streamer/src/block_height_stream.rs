use crate::bitmap::{Base64Bitmap, BitmapOperator};
use crate::graphql::client::GraphQLClient;
use crate::rules::types::ChainId;
use anyhow::Context;
use async_stream::try_stream;
use chrono::{DateTime, Duration, TimeZone, Utc};
use futures::stream::{BoxStream, Stream};
use futures::StreamExt;
use near_lake_framework::near_indexer_primitives;
use regex::Regex;

const MAX_S3_RETRY_COUNT: u8 = 20;

#[derive(Debug, Eq, PartialEq)]
enum ContractPatternType {
    Exact(Vec<String>),
    Wildcard(String),
}

pub use BlockHeightStreamImpl as BlockHeightStream;

pub struct BlockHeightStreamImpl {
    graphql_client: GraphQLClient,
    bitmap_operator: BitmapOperator,
    s3_client: crate::s3_client::S3Client,
    chain_id: ChainId,
}

impl BlockHeightStreamImpl {
    pub fn new(
        graphql_client: GraphQLClient,
        bitmap_operator: BitmapOperator,
        s3_client: crate::s3_client::S3Client,
    ) -> Self {
        Self {
            graphql_client,
            bitmap_operator,
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

    fn strip_wildcard_if_root_account(&self, receiver_id: String) -> String {
        let wildcard_root_account_regex = Regex::new(r"^\*\.([a-zA-Z0-9]+)$").unwrap();
        if wildcard_root_account_regex.is_match(&receiver_id) {
            return receiver_id
                .split('.')
                .nth(1)
                .unwrap_or(&receiver_id)
                .to_string();
        }
        receiver_id
    }

    fn parse_contract_pattern(&self, contract_pattern: &str) -> ContractPatternType {
        // If receiver_id is of pattern *.SOME_ROOT_ACCOUNT such as *.near, we can reduce this to
        // "near" as we store bitmaps for root accounts like near ,tg, and so on.
        let cleaned_contract_pattern: String = contract_pattern
            .split(',')
            .map(|receiver| receiver.trim())
            .map(str::to_string)
            .map(|receiver| self.strip_wildcard_if_root_account(receiver))
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

    fn stream_matching_block_heights<'b, 'a: 'b>(
        &'a self,
        start_block_height: near_indexer_primitives::types::BlockHeight,
        contract_pattern: String,
    ) -> impl futures::Stream<Item = anyhow::Result<u64>> + 'b {
        try_stream! {
            let start_date = self.get_nearest_block_date(start_block_height).await?;
            let contract_pattern_type = self.parse_contract_pattern(&contract_pattern);
            let mut current_date = start_date;
            while current_date <= Utc::now() {
                let bitmaps_from_query: Vec<Base64Bitmap> = match contract_pattern_type {
                    ContractPatternType::Exact(ref pattern) => {
                        let query_result: Vec<_> = self.graphql_client.get_bitmaps_exact(pattern.clone(), &current_date).await.unwrap();
                        query_result.iter().map(|result_item| Base64Bitmap::try_from(result_item).unwrap()).collect()
                    },
                    ContractPatternType::Wildcard(ref pattern) => {
                        let query_result: Vec<_> = self.graphql_client.get_bitmaps_wildcard(pattern.clone(), &current_date).await.unwrap();
                        query_result.iter().map(|result_item| Base64Bitmap::try_from(result_item).unwrap()).collect()
                    },
                };
                // convert to base64
                // convert to compressed
                // convert to decompressed
                // merge
                if !bitmaps_from_query.is_empty() {
                    let starting_block_height = bitmaps_from_query.iter().map(|item| item.start_block_height).min().unwrap();
                    let bitmap_for_day = self.bitmap_operator.merge_bitmaps(&bitmaps_from_query, starting_block_height).unwrap();
                    for index in 0..(bitmap_for_day.bitmap.len() * 8) {
                        if self.bitmap_operator.get_bit(&bitmap_for_day.bitmap, index) {
                            yield starting_block_height + u64::try_from(index)?;
                        }
                    }
                }
                current_date = self.next_day(current_date);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate;

    const HASURA_ENDPOINT: &str =
        "https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql";

    fn exact_query_result(
        first_block_height: i64,
        bitmap: &str,
    ) -> crate::graphql::client::get_bitmaps_exact::GetBitmapsExactDarunrsNearBitmapV5ActionsIndex
    {
        crate::graphql::client::get_bitmaps_exact::GetBitmapsExactDarunrsNearBitmapV5ActionsIndex {
            first_block_height,
            bitmap: bitmap.to_string(),
        }
    }

    fn wildcard_query_result(
        first_block_height: i64,
        bitmap: &str
    ) -> crate::graphql::client::get_bitmaps_wildcard::GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex{
        crate::graphql::client::get_bitmaps_wildcard::GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex {
            first_block_height,
            bitmap: bitmap.to_string(),
        }
    }

    fn generate_block_with_timestamp(date: &str) -> String {
        let naive_date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();

        let date_time_utc = chrono::Utc.from_utc_datetime(&naive_date).timestamp() * 1_000_000_000;

        format!(
            r#"{{
                "author": "someone",
                "header": {{
                  "approvals": [],
                  "block_merkle_root": "ERiC7AJ2zbVz1HJHThR5NWDDN9vByhwdjcVfivmpY5B",
                  "block_ordinal": 92102682,
                  "challenges_result": [],
                  "challenges_root": "11111111111111111111111111111111",
                  "chunk_headers_root": "MDiJxDyvUQaZRKmUwa5jgQuV6XjwVvnm4tDrajCxwvz",
                  "chunk_mask": [],
                  "chunk_receipts_root": "n84wEo7kTKTCJsyqBZ2jndhjrAMeJAXMwKvnJR7vCuy",
                  "chunk_tx_root": "D8j64GMKBMvUfvnuHtWUyDtMHM5mJ2pA4G5VmYYJvo5G",
                  "chunks_included": 4,
                  "epoch_id": "2RMQiomr6CSSwUWpmB62YohxHbfadrHfcsaa3FVb4J9x",
                  "epoch_sync_data_hash": null,
                  "gas_price": "100000000",
                  "hash": "FA1z9RVm9fX3g3mgP3NToZGwWeeXYn8bvZs4nwwTgCpD",
                  "height": 102162333,
                  "last_ds_final_block": "Ax2a3MSYuv2hgybnCbpNJMdYmPrHDHdA2hHTUrBkD915",
                  "last_final_block": "8xkwjn6Lb6UhMBhxcbVQBf3318GafkdaXoHA8Jako1nn",
                  "latest_protocol_version": 62,
                  "next_bp_hash": "dmW84aEj2iVJMLwJodJwTfAyeA1LJaHEthvnoAsvTPt",
                  "next_epoch_id": "C9TDDYthANoduoTBZS7WYDsBSe9XCm4M2F9hRoVXVXWY",
                  "outcome_root": "6WxzWLVp4b4bFbxHzu18apVfXLvHGKY7CHoqD2Eq3TFJ",
                  "prev_hash": "Ax2a3MSYuv2hgybnCbpNJMdYmPrHDHdA2hHTUrBkD915",
                  "prev_height": 102162332,
                  "prev_state_root": "Aq2ndkyDiwroUWN69Ema9hHtnr6dPHoEBRNyfmd8v4gB",
                  "random_value": "7ruuMyDhGtTkYaCGYMy7PirPiM79DXa8GhVzQW1pHRoz",
                  "rent_paid": "0",
                  "signature": "ed25519:5gYYaWHkAEK5etB8tDpw7fmehkoYSprUxKPygaNqmhVDFCMkA1n379AtL1BBkQswLAPxWs1BZvypFnnLvBtHRknm",
                  "timestamp": 1695921400989555700,
                  "timestamp_nanosec": "{}",
                  "total_supply": "1155783047679681223245725102954966",
                  "validator_proposals": [],
                  "validator_reward": "0"
                }},
                "chunks": []
            }}"#,
            date_time_utc
        )
    }

    #[test]
    fn parse_exact_contract_patterns() {
        let mock_s3_client = crate::s3_client::S3Client::default();
        let mock_graphql_client = crate::graphql::client::GraphQLClient::default();
        let bitmap_operator = crate::bitmap::BitmapOperator::new();
        let block_height_stream =
            BlockHeightStreamImpl::new(mock_graphql_client, bitmap_operator, mock_s3_client);
        let sample_patterns = vec![
            "near",
            "*.near",
            "near, someone.tg",
            "*.near, someone.tg, *.tg",
            "a.near, b.near, a.b, a.b.c.near",
        ];

        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[0]),
            ContractPatternType::Exact(vec!["near".to_string()])
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[1]),
            ContractPatternType::Exact(vec!["near".to_string()])
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[2]),
            ContractPatternType::Exact(vec!["near".to_string(), "someone.tg".to_string()],)
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[3]),
            ContractPatternType::Exact(vec![
                "near".to_string(),
                "someone.tg".to_string(),
                "tg".to_string()
            ],)
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[4]),
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
        let mock_graphql_client = crate::graphql::client::GraphQLClient::default();
        let bitmap_operator = crate::bitmap::BitmapOperator::new();
        let block_height_stream =
            BlockHeightStreamImpl::new(mock_graphql_client, bitmap_operator, mock_s3_client);
        let sample_patterns = vec![
            "*.someone.near",
            "near, someone.*.tg",
            "a.near, b.*, *.b, a.*.c.near",
        ];

        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[0]),
            ContractPatternType::Wildcard(".*\\.someone\\.near".to_string())
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[1]),
            ContractPatternType::Wildcard("near|someone\\..*\\.tg".to_string())
        );
        assert_eq!(
            block_height_stream.parse_contract_pattern(sample_patterns[2]),
            ContractPatternType::Wildcard("a\\.near|b\\..*|b|a\\..*\\.c\\.near".to_string())
        );
    }

    #[tokio::test]
    async fn collect_block_heights_from_one_day() {
        let mut mock_s3_client = crate::s3_client::S3Client::default();
        mock_s3_client
            .expect_get_text_file()
            .returning(move |_, _| {
                Ok(generate_block_with_timestamp(
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

        let block_height_stream = BlockHeightStreamImpl::new(
            mock_graphql_client,
            crate::bitmap::BitmapOperator::new(),
            mock_s3_client,
        );

        let stream =
            block_height_stream.stream_matching_block_heights(0, "someone.near".to_owned());
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
                Ok(generate_block_with_timestamp(
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
            .times(1)
            .returning(move |_, _| {
                Ok(vec![
                    wildcard_query_result(1, "wA=="),
                    wildcard_query_result(5, "wA=="),
                ])
            });
        mock_graphql_client
            .expect_get_bitmaps_wildcard()
            .with(
                predicate::eq(".*\\.someone\\.near".to_string()),
                predicate::function(|date: &DateTime<Utc>| {
                    date.date_naive() == (Utc::now() - Duration::days(1)).date_naive()
                }),
            )
            .times(1)
            .returning(move |_, _| {
                Ok(vec![
                    wildcard_query_result(10, "wA=="),
                    wildcard_query_result(15, "wA=="),
                ])
            });
        mock_graphql_client
            .expect_get_bitmaps_wildcard()
            .with(
                predicate::eq(".*\\.someone\\.near".to_string()),
                predicate::function(|date: &DateTime<Utc>| {
                    date.date_naive() == Utc::now().date_naive()
                }),
            )
            .times(1)
            .returning(move |_, _| {
                Ok(vec![
                    wildcard_query_result(100, "wA=="),
                    wildcard_query_result(105, "wA=="),
                ])
            });
        let block_height_stream = BlockHeightStreamImpl::new(
            mock_graphql_client,
            crate::bitmap::BitmapOperator::new(),
            mock_s3_client,
        );

        let stream =
            block_height_stream.stream_matching_block_heights(0, "*.someone.near".to_string());
        tokio::pin!(stream);
        let mut result_heights = vec![];
        while let Some(Ok(height)) = stream.next().await {
            result_heights.push(height);
        }
        assert_eq!(result_heights, vec![1, 5, 10, 15, 100, 105]);
    }
}
