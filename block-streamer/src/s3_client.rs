#[async_trait::async_trait]
#[mockall::automock]
pub trait S3ClientTrait {
    async fn get_object(
        &self,
        bucket: &str,
        prefix: &str,
    ) -> Result<
        aws_sdk_s3::operation::get_object::GetObjectOutput,
        aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::get_object::GetObjectError>,
    >;

    async fn list_objects(
        &self,
        bucket: &str,
        prefix: &str,
        continuation_token: Option<String>,
    ) -> Result<
        aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Output,
        aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Error>,
    >;

    async fn get_text_file(&self, bucket: &str, prefix: &str) -> anyhow::Result<String>;
}

#[derive(Clone, Debug)]
pub struct S3Client {
    client: aws_sdk_s3::Client,
}

impl S3Client {
    pub fn new(aws_config: &aws_types::sdk_config::SdkConfig) -> Self {
        Self {
            client: aws_sdk_s3::Client::new(aws_config),
        }
    }
}

#[async_trait::async_trait]
impl S3ClientTrait for S3Client {
    async fn get_object(
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

    async fn list_objects(
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

    async fn get_text_file(&self, bucket: &str, prefix: &str) -> anyhow::Result<String> {
        let object = self.get_object(bucket, prefix).await?;

        let bytes = object.body.collect().await?;

        Ok(String::from_utf8(bytes.to_vec())?)
    }
}
