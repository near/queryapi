use crate::historical_block_processing::METADATA_FOLDER;
use anyhow::{bail, Context, Result};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::Config;
use aws_types::SdkConfig;
use chrono::{DateTime, NaiveDate, Utc};
use futures::future::try_join_all;
use regex::Regex;

// Sanity check, if we hit this we have 1M S3 results.
// Currently that would be either 2,700 years of FunctionCall data or 1M contract folders.
// If we hit 1M contracts we should build an index to support efficient wildcard contract matching.
const MAX_S3_LIST_REQUESTS: usize = 1000;

fn storage_path_for_account(account: &str) -> String {
    let mut folders = account.split('.').collect::<Vec<&str>>();
    folders.reverse();
    folders.join("/")
}

pub async fn find_index_files_by_pattern(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_folder: &str,
    pattern: &str,
) -> Result<Vec<String>> {
    Ok(match pattern {
        x if x.contains(',') => {
            let account_array = x.split(',');
            let mut results = vec![];
            for account in account_array {
                let account = account.trim();
                let sub_results = if account.contains('*') {
                    list_index_files_by_wildcard(aws_config, s3_bucket, s3_folder, &account).await?
                } else {
                    list_s3_bucket_by_prefix(
                        aws_config,
                        s3_bucket,
                        &format!(
                            "{}/{}/{}/",
                            s3_folder,
                            storage_path_for_account(account),
                            METADATA_FOLDER
                        ),
                    )
                    .await?
                };
                results.extend(sub_results);
            }
            results
        }
        x if x.contains('*') => {
            list_index_files_by_wildcard(aws_config, s3_bucket, s3_folder, &x).await?
        }
        _ => {
            list_s3_bucket_by_prefix(
                aws_config,
                s3_bucket,
                &format!(
                    "{}/{}/{}/",
                    s3_folder,
                    storage_path_for_account(pattern),
                    METADATA_FOLDER
                ),
            )
            .await?
        }
    })
}

async fn list_index_files_by_wildcard(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_folder: &str,
    pattern: &&str,
) -> Result<Vec<String>> {
    // remove sub-account wildcard from pattern
    let pattern = pattern.replace("*.", "");
    let path = storage_path_for_account(&pattern);

    let folders =
        list_s3_bucket_by_prefix(aws_config, s3_bucket, &format!("{}/{}/", s3_folder, path))
            .await?;
    // for each matching folder list files
    let mut results = vec![];
    for folder in folders {
        results.extend(list_s3_bucket_by_prefix(aws_config, s3_bucket, &folder).await?);
    }
    Ok(results)
}

async fn list_s3_bucket_by_prefix(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_prefix: &str,
) -> Result<Vec<String>> {
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

        let file_list = configured_client.send().await?;
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
                bail!("Exceeded internal limit of {MAX_S3_LIST_REQUESTS}")
            }
        } else {
            break;
        }
    }
    Ok(results)
}

pub async fn fetch_contract_index_files(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_folder: &str,
    start_date: DateTime<Utc>,
    contract_pattern: &str,
) -> Result<Vec<String>> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);

    // list all index files
    let file_list =
        find_index_files_by_pattern(aws_config, s3_bucket, s3_folder, contract_pattern).await?;

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
    let file_contents: Vec<String> = try_join_all(fetch_and_parse_tasks).await?;
    Ok(file_contents
        .into_iter()
        .filter(|file_contents| !file_contents.is_empty())
        .collect::<Vec<String>>())
}

pub async fn fetch_text_file_from_s3(
    s3_bucket: &str,
    key: String,
    s3_client: S3Client,
) -> Result<String> {
    // todo: can we retry if this fails like the lake s3_fetcher fn does?
    // If so, can we differentiate between a file not existing (block height does not exist) and a network error?
    let get_object_output = s3_client
        .get_object()
        .bucket(s3_bucket)
        .key(key.clone())
        .send()
        .await
        .with_context(|| format!("Error fetching index file {key}"))?;

    let bytes = get_object_output
        .body
        .collect()
        .await
        .with_context(|| format!("Error reading bytes of index file {key}"))?;
    String::from_utf8(bytes.to_vec()).with_context(|| format!("Error parsing index file {key}"))
}

/// check whether the filename is a date after the start date
/// filename is in format 2022-10-03.json
fn file_name_date_after(start_date: DateTime<Utc>, file_name: &str) -> bool {
    let file_name_date = file_name.split('/').last().unwrap().replace(".json", "");
    let file_name_date = NaiveDate::parse_from_str(&file_name_date, "%Y-%m-%d");
    match file_name_date {
        Ok(file_name_date) => file_name_date >= start_date.date_naive(),
        Err(e) => {
            // if we can't parse the date assume a file this code is not meant to handle
            tracing::debug!(
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
    use crate::historical_block_processing::INDEXED_ACTIONS_FILES_FOLDER;
    use crate::historical_block_processing::INDEXED_DATA_FILES_BUCKET;
    use crate::opts::Opts;
    use crate::s3::{find_index_files_by_pattern, list_s3_bucket_by_prefix};

    /// Parses env vars from .env, Run with
    /// cargo test s3::tests::list_delta_bucket -- mainnet from-latest;
    #[tokio::test]
    async fn list_delta_bucket() {
        let opts = Opts::test_opts_with_aws();

        let list = list_s3_bucket_by_prefix(
            &opts.lake_aws_sdk_config(),
            INDEXED_DATA_FILES_BUCKET,
            &format!("{}/", INDEXED_ACTIONS_FILES_FOLDER.to_string()),
        )
        .await
        .unwrap();
        assert!(list.len() > 35000);
    }

    /// cargo test s3::tests::list_with_single_contract -- mainnet from-latest
    #[tokio::test]
    async fn list_with_single_contract() {
        let opts = Opts::test_opts_with_aws();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            INDEXED_DATA_FILES_BUCKET,
            INDEXED_ACTIONS_FILES_FOLDER,
            "hackathon.agency.near",
        )
        .await
        .unwrap();
        assert_eq!(list.len(), 1);
    }

    /// cargo test s3::tests::list_with_csv_contracts -- mainnet from-latest
    #[tokio::test]
    async fn list_with_csv_contracts() {
        let opts = Opts::test_opts_with_aws();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            INDEXED_DATA_FILES_BUCKET,
            INDEXED_ACTIONS_FILES_FOLDER,
            "hackathon.agency.near, hackathon.aurora-silo-dev.near, hackathon.sputnik-dao.near",
        )
        .await
        .unwrap();
        assert!(list.len() >= 13); // expecting 13 but these contracts could get randomly called sometime
    }

    /// cargo test s3::tests::list_with_wildcard_contracts -- mainnet from-latest
    #[tokio::test]
    async fn list_with_wildcard_contracts() {
        let opts = Opts::test_opts_with_aws();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            INDEXED_DATA_FILES_BUCKET,
            INDEXED_ACTIONS_FILES_FOLDER,
            "*.keypom.near",
        )
        .await
        .unwrap();
        assert!(list.len() >= 550);
    }

    /// cargo test s3::tests::list_with_csv_and_wildcard_contracts -- mainnet from-latest
    #[tokio::test]
    async fn list_with_csv_and_wildcard_contracts() {
        let opts = Opts::test_opts_with_aws();

        let list = find_index_files_by_pattern(
            &opts.lake_aws_sdk_config(),
            INDEXED_DATA_FILES_BUCKET,
            INDEXED_ACTIONS_FILES_FOLDER,
            "*.keypom.near, hackathon.agency.near, *.nearcrowd.near",
        )
        .await
        .unwrap();
        assert!(list.len() > 1370);
    }

    #[test]
    fn storage_path_for_account_splits_and_reverses_into_folders() {
        let account = "buildnear.testnet";
        let expected = "testnet/buildnear";
        let actual = super::storage_path_for_account(account);
        assert_eq!(expected, actual);

        let account = "v2.keypom.near";
        let expected = "near/keypom/v2";
        let actual = super::storage_path_for_account(account);
        assert_eq!(expected, actual);

        let account = "0.app5.hipodev.near";
        let expected = "near/hipodev/app5/0";
        let actual = super::storage_path_for_account(account);
        assert_eq!(expected, actual);
    }
}
