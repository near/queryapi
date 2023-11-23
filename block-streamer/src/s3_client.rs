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
            .request_payer(aws_sdk_s3::types::RequestPayer::Requester)
            .send()
            .await
    }

    async fn get_text_file(&self, bucket: &str, prefix: &str) -> anyhow::Result<String> {
        let object = self.get_object(bucket, prefix).await?;

        let bytes = object.body.collect().await?;

        Ok(String::from_utf8(bytes.to_vec())?)
    }
}
