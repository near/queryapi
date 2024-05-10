use std::sync::Arc;

use crate::indexer_state::IndexerStateManager;

mod indexer_manager_service;

pub mod indexer_manager {
    tonic::include_proto!("indexer");
}

pub async fn init(
    port: String,
    indexer_state_manager: Arc<IndexerStateManager>,
) -> anyhow::Result<()> {
    let addr = format!("0.0.0.0:{}", port).parse()?;

    tracing::info!("Starting gRPC server on {}", addr);

    let indexer_manager_service =
        indexer_manager_service::IndexerManagerService::new(indexer_state_manager);

    let indexer_manager_server =
        indexer_manager::indexer_manager_server::IndexerManagerServer::new(indexer_manager_service);

    tonic::transport::Server::builder()
        .add_service(indexer_manager_server)
        .serve(addr)
        .await
        .map_err(Into::into)
}
