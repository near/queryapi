use crate::bitmap_processor;

mod block_streamer_service;

pub mod blockstreamer {
    tonic::include_proto!("blockstreamer");
}

pub async fn init(
    port: &str,
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    bitmap_processor: std::sync::Arc<crate::bitmap_processor::BitmapProcessor>,
    lake_s3_client: crate::lake_s3_client::SharedLakeS3Client,
) -> anyhow::Result<()> {
    let addr = format!("0.0.0.0:{}", port).parse()?;

    tracing::info!("Starting gRPC server on {}", addr);

    let block_streamer_service = block_streamer_service::BlockStreamerService::new(
        redis_client,
        bitmap_processor,
        lake_s3_client,
    );

    let block_streamer_server =
        blockstreamer::block_streamer_server::BlockStreamerServer::new(block_streamer_service);

    tonic::transport::Server::builder()
        .add_service(block_streamer_server)
        .serve(addr)
        .await
        .map_err(|err| err.into())
}
