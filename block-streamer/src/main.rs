use tracing_subscriber::prelude::*;

mod block_stream;
mod delta_lake_client;
mod indexer_config;
mod redis;
mod rules;
mod s3_client;
mod server;

#[cfg(test)]
mod test_utils;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL is not set");
    let server_port = std::env::var("SERVER_PORT").expect("SERVER_PORT is not set");

    tracing::info!("Starting Block Streamer Service...");

    tracing::info!("Connecting to Redis...");
    let redis_client = std::sync::Arc::new(redis::RedisClient::connect(&redis_url).await?);

    let aws_config = aws_config::from_env().load().await;
    let s3_config = aws_sdk_s3::Config::from(&aws_config);
    let s3_client = crate::s3_client::S3Client::new(s3_config.clone());

    tracing::info!("Connecting to Delta Lake...");
    let delta_lake_client =
        std::sync::Arc::new(crate::delta_lake_client::DeltaLakeClient::new(s3_client));

    server::init(&server_port, redis_client, delta_lake_client, s3_config).await?;

    Ok(())
}
