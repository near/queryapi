use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::Config;
use aws_types::SdkConfig;
use chrono::{DateTime, NaiveDate, Utc};
use futures::future::join_all;

// Sanity check, if we hit this we have 1M S3 results.
// Currently that would be either 2,700 years of FunctionCall data or 1M contract folders.
const MAX_S3_LIST_REQUESTS: usize = 1000;

async fn list_s3_bucket_by_prefix(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_prefix: String,
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
            .prefix(s3_prefix.clone())
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
    s3_prefix: String,
    start_date: DateTime<Utc>,
) -> Vec<String> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);

    // list all index files
    let file_list = list_s3_bucket_by_prefix(aws_config, s3_bucket, s3_prefix).await;

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
        .filter(|file_contents| file_contents.len() > 0)
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
    let file_name_date = file_name.split("/").last().unwrap().replace(".json", "");
    let file_name_date = NaiveDate::parse_from_str(&file_name_date, "%Y-%m-%d");
    match file_name_date {
        Ok(file_name_date) => {
            if file_name_date >= start_date.date_naive() {
                true
            } else {
                false
            }
        }
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
    use crate::s3::list_s3_bucket_by_prefix;
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
            format!(
                "{}/",
                crate::historical_block_processing::INDEXED_DATA_FILES_FOLDER.to_string()
            ),
        )
        .await;
        assert!(list.len() > 35000);
    }
}
