use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::Config;
use aws_types::SdkConfig;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use futures::future::join_all;

pub async fn fetch_contract_index_files(
    aws_config: &SdkConfig,
    s3_bucket: &str,
    s3_prefix: String,
    start_date: DateTime<Utc>,
) -> Vec<String> {
    let s3_config: Config = aws_sdk_s3::config::Builder::from(aws_config).build();
    let s3_client: S3Client = S3Client::from_conf(s3_config);

    match s3_client
        .list_objects_v2()
        .bucket(s3_bucket)
        .prefix(s3_prefix)
        .send()
        .await
    {
        Ok(file_list) => {
            if let Some(objects) = file_list.contents {
                let fetch_and_parse_tasks = objects
                    .into_iter()
                    .filter(|index_file_listing| {
                        file_name_date_after(start_date, index_file_listing.key.clone().unwrap())
                    })
                    .map(|index_file_listing| {
                        let key = index_file_listing.key.clone().unwrap();

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
            } else {
                tracing::error!(
                    target: crate::INDEXER,
                    "Error listing files in S3 bucket, no files found."
                );
                vec![]
            }
        }
        Err(e) => {
            tracing::error!(
                target: crate::INDEXER,
                "Error listing files in S3 bucket: {:?}",
                e
            );
            vec![]
        }
    }
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
fn file_name_date_after(start_date: DateTime<Utc>, file_name: String) -> bool {
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
