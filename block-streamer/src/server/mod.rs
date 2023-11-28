use tonic::transport::Server;

mod route_guide_service;

pub mod routeguide {
    tonic::include_proto!("routeguide");
}

pub async fn init() -> anyhow::Result<()> {
    let addr = "[::1]:10000".parse().unwrap();

    println!("RouteGuideServer listening on: {}", addr);

    let route_guide_service = route_guide_service::RouteGuideService::new();
    let route_guide_server =
        routeguide::route_guide_server::RouteGuideServer::new(route_guide_service);

    Server::builder()
        .add_service(route_guide_server)
        .serve(addr)
        .await
        .map_err(|err| err.into())
}