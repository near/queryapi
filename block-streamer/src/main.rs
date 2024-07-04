use tracing_subscriber::prelude::*;

mod block_stream;
mod graphql;
mod indexer_config;
mod lake_s3_client;
mod metrics;
mod receiver_blocks;
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
    let graphql_endpoint =
        std::env::var("HASURA_GRAPHQL_ENDPOINT").expect("HASURA_GRAPHQL_ENDPOINT is not set"); // Prod Hasura
    let grpc_port = std::env::var("GRPC_PORT").expect("GRPC_PORT is not set");
    let metrics_port = std::env::var("METRICS_PORT")
        .expect("METRICS_PORT is not set")
        .parse()
        .expect("METRICS_PORT is not a valid number");

    tracing::info!(
        redis_url,
        grpc_port,
        metrics_port,
        graphql_endpoint,
        "Starting Block Streamer"
    );

    let redis_client = std::sync::Arc::new(redis::RedisClient::connect(&redis_url).await?);

    let aws_config = aws_config::from_env().load().await;
    let s3_config = aws_sdk_s3::Config::from(&aws_config);
    let s3_client = crate::s3_client::S3Client::new(s3_config.clone());

    let graphql_client = graphql::client::GraphQLClient::new(graphql_endpoint);
    let receiver_blocks_processor = std::sync::Arc::new(
        crate::receiver_blocks::ReceiverBlocksProcessor::new(graphql_client, s3_client.clone()),
    );

    let lake_s3_client = crate::lake_s3_client::SharedLakeS3Client::from_conf(s3_config);

    tokio::spawn(metrics::init_server(metrics_port).expect("Failed to start metrics server"));

    server::init(
        &grpc_port,
        redis_client,
        receiver_blocks_processor,
        lake_s3_client,
    )
    .await?;

    Ok(())
}
