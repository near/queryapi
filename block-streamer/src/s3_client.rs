#![cfg_attr(test, allow(dead_code))]

use anyhow::Context;

#[cfg(test)]
pub use MockS3ClientImpl as S3Client;
#[cfg(not(test))]
pub use S3ClientImpl as S3Client;

#[derive(Clone, Debug)]
pub struct S3ClientImpl {
    client: aws_sdk_s3::Client,
}

impl S3ClientImpl {
    pub fn new(s3_config: aws_sdk_s3::Config) -> Self {
        Self {
            client: aws_sdk_s3::Client::from_conf(s3_config),
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

    pub async fn list_objects_after(
        &self,
        bucket: &str,
        start_after: &str,
    ) -> Result<
        aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Output,
        aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Error>,
    > {
        self.client
            .list_objects_v2()
            .delimiter("/")
            .bucket(bucket)
            .start_after(start_after)
            .send()
            .await
    }

    pub async fn get_text_file(&self, bucket: &str, prefix: &str) -> anyhow::Result<String> {
        let object = self
            .get_object(bucket, prefix)
            .await
            .context(format!("Failed to fetch {bucket}/{prefix}"))?;

        let bytes = object.body.collect().await?;

        Ok(String::from_utf8(bytes.to_vec())?)
    }
}

#[cfg(test)]
mockall::mock! {
    #[derive(Debug)]
    pub S3ClientImpl {
        pub fn new(s3_config: aws_sdk_s3::Config) -> Self;

        pub async fn get_object(
            &self,
            bucket: &str,
            prefix: &str,
        ) -> Result<
            aws_sdk_s3::operation::get_object::GetObjectOutput,
            aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::get_object::GetObjectError>,
        >;

        pub async fn list_objects_after(
            &self,
            bucket: &str,
            start_after: &str,
        ) -> Result<
            aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Output,
            aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Error>,
        >;

        pub async fn get_text_file(&self, bucket: &str, prefix: &str) -> anyhow::Result<String>;
    }

    impl Clone for S3ClientImpl {
        fn clone(&self) -> Self;
    }
}
