use std::sync::Arc;

use tonic::{Request, Response, Status};

use crate::indexer_state::IndexerStateManager;
use crate::server::indexer_manager;

pub struct IndexerManagerService {
    indexer_state_manager: Arc<IndexerStateManager>,
}

impl IndexerManagerService {
    pub fn new(indexer_state_manager: Arc<IndexerStateManager>) -> Self {
        Self {
            indexer_state_manager,
        }
    }
}

#[tonic::async_trait]
impl indexer_manager::indexer_manager_server::IndexerManager for IndexerManagerService {
    #[tracing::instrument(
        skip_all,
        fields(
            account_id = request.get_ref().account_id,
            function_name = request.get_ref().function_name
        )
    )]
    async fn enable(
        &self,
        request: Request<indexer_manager::IndexerRequest>,
    ) -> Result<Response<indexer_manager::IndexerResponse>, Status> {
        tracing::info!("Enabling indexer");

        Ok(Response::new(indexer_manager::IndexerResponse {
            success: true,
            message: "Indexer enabled".to_string(),
        }))
    }

    #[tracing::instrument(
        skip_all,
        fields(
            account_id = request.get_ref().account_id,
            function_name = request.get_ref().function_name
        )
    )]
    async fn disable(
        &self,
        request: Request<indexer_manager::IndexerRequest>,
    ) -> Result<Response<indexer_manager::IndexerResponse>, Status> {
        tracing::info!("Disabling indexer");

        Ok(Response::new(indexer_manager::IndexerResponse {
            success: true,
            message: "Indexer disabled".to_string(),
        }))
    }
}
