mod block_streamer_service;

pub mod blockstreamer {
    tonic::include_proto!("blockstreamer");
}

pub async fn init(
    port: &str,
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
    lake_s3_config: aws_sdk_s3::Config,
) -> anyhow::Result<()> {
    let addr = format!("[::1]:{}", port).parse()?;

    tracing::info!("Starting RPC server at {}", addr);

    let block_streamer_service = block_streamer_service::BlockStreamerService::new(
        redis_client,
        delta_lake_client,
        lake_s3_config,
    );

    let block_streamer_server =
        blockstreamer::block_streamer_server::BlockStreamerServer::new(block_streamer_service);

    tonic::transport::Server::builder()
        .add_service(block_streamer_server)
        .serve(addr)
        .await
        .map_err(|err| err.into())
}
