use anyhow::Context;

pub struct DeltaLakeClient<T>
where
    T: crate::s3_client::S3ClientTrait,
{
    s3_client: T,
}

impl<T> DeltaLakeClient<T>
where
    T: crate::s3_client::S3ClientTrait,
{
    pub fn new(s3_client: T) -> Self {
        DeltaLakeClient { s3_client }
    }
}
