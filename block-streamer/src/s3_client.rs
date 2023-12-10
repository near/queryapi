const MAX_S3_LIST_REQUESTS: usize = 1000;

#[cfg(test)]
pub use MockS3ClientImpl as S3Client;
#[cfg(not(test))]
pub use S3ClientImpl as S3Client;

#[derive(Clone, Debug)]
pub struct S3ClientImpl {
    client: aws_sdk_s3::Client,
}

#[cfg_attr(test, mockall::automock)]
impl S3ClientImpl {
    pub fn new(aws_config: &aws_types::sdk_config::SdkConfig) -> Self {
        Self {
            client: aws_sdk_s3::Client::new(aws_config),
        }
    }

    pub async fn get_object(
        &self,
        bucket: &str,
        prefix: &str,
    ) -> Result<
        aws_sdk_s3::operation::get_object::GetObjectOutput,
        aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::get_object::GetObjectError>,
    > {
        self.client
            .get_object()
            .bucket(bucket)
            .key(prefix)
            .send()
            .await
    }

    pub async fn list_objects(
        &self,
        bucket: &str,
        prefix: &str,
        continuation_token: Option<String>,
    ) -> Result<
        aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Output,
        aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Error>,
    > {
        let mut builder = self
            .client
            .list_objects_v2()
            .delimiter("/")
            .bucket(bucket)
            .prefix(prefix);

        if let Some(token) = continuation_token {
            builder = builder.continuation_token(token);
        }

        builder.send().await
    }

    pub async fn get_text_file(&self, bucket: &str, prefix: &str) -> anyhow::Result<String> {
        let object = self.get_object(bucket, prefix).await?;

        let bytes = object.body.collect().await?;

        Ok(String::from_utf8(bytes.to_vec())?)
    }

    pub async fn list_all_objects(
        &self,
        bucket: &str,
        prefix: &str,
    ) -> anyhow::Result<Vec<String>> {
        let mut results = vec![];
        let mut continuation_token: Option<String> = None;

        let mut counter = 0;
        loop {
            if counter > MAX_S3_LIST_REQUESTS {
                anyhow::bail!("Exceeded internal limit of {MAX_S3_LIST_REQUESTS}")
            }

            let list = self
                .list_objects(bucket, prefix, continuation_token)
                .await?;

            if let Some(common_prefixes) = list.common_prefixes {
                let keys: Vec<String> = common_prefixes
                    .into_iter()
                    .filter_map(|common_prefix| common_prefix.prefix)
                    .collect();

                results.extend(keys);
            }

            if let Some(objects) = list.contents {
                let keys: Vec<String> = objects
                    .into_iter()
                    .filter_map(|object| object.key)
                    .collect();

                results.extend(keys);
            }

            if list.next_continuation_token.is_some() {
                continuation_token = list.next_continuation_token;
                counter += 1;
            } else {
                break;
            }
        }

        Ok(results)
    }
}
