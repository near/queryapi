use tracing_subscriber::prelude::*;

mod bitmap;
mod bitmap_processor;
mod block_stream;
mod delta_lake_client;
mod graphql;
mod indexer_config;
mod lake_s3_client;
mod metrics;
mod redis;
mod rules;
mod s3_client;
mod server;
mod utils;

#[cfg(test)]
mod test_utils;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let subscriber = tracing_subscriber::registry()
        .with(metrics::LogCounter)
        .with(tracing_subscriber::EnvFilter::from_default_env());

    if std::env::var("GCP_LOGGING_ENABLED").is_ok() {
        subscriber.with(tracing_stackdriver::layer()).init();
    } else {
        subscriber
            .with(tracing_subscriber::fmt::layer().compact())
            .init();
    }

    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL is not set");
    let grpc_port = std::env::var("GRPC_PORT").expect("GRPC_PORT is not set");
    let metrics_port = std::env::var("METRICS_PORT")
        .expect("METRICS_PORT is not set")
        .parse()
        .expect("METRICS_PORT is not a valid number");

    tracing::info!(
        redis_url,
        grpc_port,
        metrics_port,
        "Starting Block Streamer"
    );

    let redis = std::sync::Arc::new(redis::RedisClient::connect(&redis_url).await?);

    let aws_config = aws_config::from_env().load().await;
    let s3_config = aws_sdk_s3::Config::from(&aws_config);
    let s3_client = crate::s3_client::S3Client::new(s3_config.clone());

    let delta_lake_client =
        std::sync::Arc::new(crate::delta_lake_client::DeltaLakeClient::new(s3_client));

    let lake_s3_client = crate::lake_s3_client::SharedLakeS3Client::from_conf(s3_config);

    tokio::spawn(metrics::init_server(metrics_port).expect("Failed to start metrics server"));

    server::init(&grpc_port, redis, delta_lake_client, lake_s3_client).await?;

    Ok(())
}
