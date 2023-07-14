use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::Config;
use aws_types::SdkConfig;
use chrono::{DateTime, NaiveDate, Utc};
use futures::future::join_all;
use regex::Regex;

// Sanity check, if we hit this we have 1M S3 results.
// Currently that would be either 2,700 years of FunctionCall data or 1M contract folders.
const MAX_S3_LIST_REQUESTS: usize = 1000;

pub async fn find_index_files_by_pattern(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_folder: &str,
    pattern: &str,
) -> Vec<String> {
    match pattern {
        x if x.contains(',') => {
            let contract_array = x.split(',');
            let mut results = vec![];
            for contract in contract_array {
                let contract = contract.trim();
                let sub_results = if contract.contains('*') {
                    list_index_files_by_wildcard(aws_config, s3_bucket, s3_folder, &contract).await
                } else {
                    list_s3_bucket_by_prefix(
                        aws_config,
                        s3_bucket,
                        &format!("{}/{}/", s3_folder, contract),
                    )
                    .await
                };
                results.extend(sub_results);
            }
            results
        }
        x if x.contains('*') => {
            list_index_files_by_wildcard(aws_config, s3_bucket, s3_folder, &x).await
        }
        _ => {
            list_s3_bucket_by_prefix(
                aws_config,
                s3_bucket,
                &format!("{}/{}/", s3_folder, pattern),
            )
            .await
        }
    }

    // todo will need to dedupe and sort the block output now
}

async fn list_index_files_by_wildcard(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_folder: &str,
    x: &&str,
) -> Vec<String> {
    // fetch all folders and filter by regex
    let folders = list_s3_bucket_by_prefix(aws_config, s3_bucket, &format!("{}/", s3_folder)).await;
    let regex_string = &x.replace('.', "\\.").replace('*', ".*");
    let re = Regex::new(regex_string).unwrap();
    let matching_folders = folders.into_iter().filter(|folder| re.is_match(folder));
    // for each matching folder list files
    let mut results = vec![];
    for folder in matching_folders {
        results.extend(list_s3_bucket_by_prefix(aws_config, s3_bucket, &folder).await);
    }
    results
}

async fn list_s3_bucket_by_prefix(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_prefix: &str,
) -> Vec<String> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);

    let mut results = vec![];
    let mut continuation_token: Option<String> = None;

    let mut counter = 0;
    loop {
        let mut configured_client = s3_client
            .list_objects_v2()
            .bucket(s3_bucket)
            .prefix(s3_prefix)
            .delimiter("/");

        if continuation_token.is_some() {
            configured_client = configured_client.continuation_token(continuation_token.unwrap());
        }

        match configured_client.send().await {
            Ok(file_list) => {
                if let Some(common_prefixes) = file_list.common_prefixes {
                    let keys: Vec<String> = common_prefixes
                        .into_iter()
                        .map(|o| o.prefix.unwrap())
                        .collect();
                    results.extend(keys);
                }
                if let Some(objects) = file_list.contents {
                    let keys: Vec<String> = objects.into_iter().map(|o| o.key.unwrap()).collect();
                    results.extend(keys);
                }
                if file_list.next_continuation_token.is_some() {
                    continuation_token = file_list.next_continuation_token;
                    counter += 1;
                    if counter > MAX_S3_LIST_REQUESTS {
                        tracing::error!("Exceeded internal limit of {MAX_S3_LIST_REQUESTS}");
                        break;
                    }
                } else {
                    break;
                }
            }
            Err(e) => {
                tracing::error!("Error listing index files: {:?}", e);
                break;
            }
        };
    }
    results
}

pub async fn fetch_contract_index_files(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_folder: &str,
    start_date: DateTime<Utc>,
    contract_pattern: &str,
) -> Vec<String> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);

    // list all index files
    let file_list =
        find_index_files_by_pattern(aws_config, s3_bucket, s3_folder, contract_pattern).await;

    let fetch_and_parse_tasks = file_list
        .into_iter()
        .filter(|index_file_listing| file_name_date_after(start_date, index_file_listing))
        .map(|key| {
            let s3_client = s3_client.clone();
            async move {
                // Fetch the file
                fetch_text_file_from_s3(s3_bucket, key, s3_client).await
            }
        })
        .collect::<Vec<_>>();

    // Execute all tasks in parallel and wait for completion
    let file_contents: Vec<String> = join_all(fetch_and_parse_tasks).await;
    file_contents
        .into_iter()
        .filter(|file_contents| !file_contents.is_empty())
        .collect::<Vec<String>>()
}

pub async fn fetch_text_file_from_s3(s3_bucket: &str, key: String, s3_client: S3Client) -> String {
    let get_object_output = s3_client
        .get_object()
        .bucket(s3_bucket)
        .key(key.clone())
        .send()
        .await;

    match get_object_output {
        Ok(object_output) => {
            let bytes = object_output.body.collect().await;
            match bytes {
                Ok(bytes) => {
                    let file_contents = String::from_utf8(bytes.to_vec());
                    match file_contents {
                        Ok(file_contents) => {
                            tracing::debug!(
                                target: crate::INDEXER,
                                "Fetched S3 file {}",
                                key.clone(),
                            );
                            file_contents
                        }
                        Err(e) => {
                            tracing::error!(
                                target: crate::INDEXER,
                                "Error parsing index file: {:?}",
                                e
                            );
                            "".to_string()
                        }
                    }
                }
                Err(e) => {
                    tracing::error!(target: crate::INDEXER, "Error fetching index file: {:?}", e);
                    "".to_string()
                }
            }
        }
        Err(e) => {
            tracing::error!(target: crate::INDEXER, "Error fetching index file: {:?}", e);
            "".to_string()
        }
    }
}

/// check whether the filename is a date after the start date
/// filename is in format 2022-10-03.json
fn file_name_date_after(start_date: DateTime<Utc>, file_name: &str) -> bool {
    let file_name_date = file_name.split('/').last().unwrap().replace(".json", "");
    let file_name_date = NaiveDate::parse_from_str(&file_name_date, "%Y-%m-%d");
    match file_name_date {
        Ok(file_name_date) => file_name_date >= start_date.date_naive(),
        Err(e) => {
            tracing::error!(
                target: crate::INDEXER,
                "Error parsing file name date: {:?}",
                e
            );
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::opts::{Opts, Parser};
    use crate::s3::{find_index_files_by_pattern, list_s3_bucket_by_prefix};
    use aws_types::SdkConfig;

    /// Parses env vars from .env, Run with
    /// cargo test s3::tests::list_delta_bucket -- mainnet from-latest;
    #[tokio::test]
    async fn list_delta_bucket() {
        let opts = Opts::parse();
        let aws_config: &SdkConfig = &opts.lake_aws_sdk_config();

        let list = list_s3_bucket_by_prefix(
            aws_config,
            crate::historical_block_processing::INDEXED_DATA_FILES_BUCKET,
            &format!(
                "{}/",
                crate::historical_block_processing::INDEXED_DATA_FILES_FOLDER.to_string()
            ),
        )
        .await;
        assert!(list.len() > 35000);
    }

    /// cargo test s3::tests::list_with_single_contract -- mainnet from-latest
    #[tokio::test]
    async fn list_with_single_contract() {
        let opts = Opts::parse();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            crate::historical_block_processing::INDEXED_DATA_FILES_BUCKET,
            crate::historical_block_processing::INDEXED_DATA_FILES_FOLDER,
            "hackathon.agency.near",
        )
        .await;
        assert_eq!(list.len(), 1);
    }

    /// cargo test s3::tests::list_with_csv_contracts -- mainnet from-latest
    #[tokio::test]
    async fn list_with_csv_contracts() {
        let opts = Opts::parse();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            crate::historical_block_processing::INDEXED_DATA_FILES_BUCKET,
            crate::historical_block_processing::INDEXED_DATA_FILES_FOLDER,
            "hackathon.agency.near, hackathon.aurora-silo-dev.near, hackathon.sputnik-dao.near",
        )
        .await;
        assert!(list.len() >= 13); // expecting 13 but these contracts could get randomly called sometime
    }

    /// cargo test s3::tests::list_with_wildcard_contracts -- mainnet from-latest
    #[tokio::test]
    async fn list_with_wildcard_contracts() {
        let opts = Opts::parse();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            crate::historical_block_processing::INDEXED_DATA_FILES_BUCKET,
            crate::historical_block_processing::INDEXED_DATA_FILES_FOLDER,
            "*.keypom.near",
        )
        .await;
        assert!(list.len() >= 550);
    }

    /// cargo test s3::tests::list_with_csv_and_wildcard_contracts -- mainnet from-latest
    #[tokio::test]
    async fn list_with_csv_and_wildcard_contracts() {
        let opts = Opts::parse();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            crate::historical_block_processing::INDEXED_DATA_FILES_BUCKET,
            crate::historical_block_processing::INDEXED_DATA_FILES_FOLDER,
            "*.keypom.near, hackathon.agency.near, *.nearcrowd.near",
        )
        .await;
        assert!(list.len() > 1370);
    }
}
