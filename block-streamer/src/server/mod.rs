mod block_streamer_service;

pub mod blockstreamer {
    tonic::include_proto!("blockstreamer");
}

pub async fn init(
    redis_client: std::sync::Arc<crate::redis::RedisClient>,
    delta_lake_client: std::sync::Arc<crate::delta_lake_client::DeltaLakeClient>,
) -> anyhow::Result<()> {
    let addr = "[::1]:10000"
        .parse()
        .expect("Failed to parse RPC socket address");

    tracing::info!("Starting RPC server at {}", addr);

    let block_streamer_service =
        block_streamer_service::BlockStreamerService::new(redis_client, delta_lake_client);

    let block_streamer_server =
        blockstreamer::block_streamer_server::BlockStreamerServer::new(block_streamer_service);

    tonic::transport::Server::builder()
        .add_service(block_streamer_server)
        .serve(addr)
        .await
        .map_err(|err| err.into())
}
