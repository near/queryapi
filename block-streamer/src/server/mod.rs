mod block_streamer_service;
mod route_guide_service;

pub mod routeguide {
    tonic::include_proto!("routeguide");
}

pub mod blockstreamer {
    tonic::include_proto!("blockstreamer");
}

pub async fn init() -> anyhow::Result<()> {
    let addr = "[::1]:10000".parse().unwrap();

    println!("RouteGuideServer listening on: {}", addr);

    let route_guide_service = route_guide_service::RouteGuideService::new();
    let route_guide_server =
        routeguide::route_guide_server::RouteGuideServer::new(route_guide_service);

    let block_streamer_service = block_streamer_service::BlockStreamerService {};
    let block_streamer_server =
        blockstreamer::block_streamer_server::BlockStreamerServer::new(block_streamer_service);

    tonic::transport::Server::builder()
        .add_service(route_guide_server)
        .add_service(block_streamer_server)
        .serve(addr)
        .await
        .map_err(|err| err.into())
}
