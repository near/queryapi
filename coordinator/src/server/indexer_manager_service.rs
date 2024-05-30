use std::sync::Arc;

use tonic::{Request, Response, Status};

use crate::indexer_state::IndexerStateManager;
use crate::registry::Registry;
use crate::server::indexer_manager;

pub struct IndexerManagerService {
    indexer_state_manager: Arc<IndexerStateManager>,
    registry: Arc<Registry>,
}

impl IndexerManagerService {
    pub fn new(indexer_state_manager: Arc<IndexerStateManager>, registry: Arc<Registry>) -> Self {
        Self {
            indexer_state_manager,
            registry,
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
    ) -> Result<Response<indexer_manager::EnableIndexerResponse>, Status> {
        let request = request.into_inner();

        let account_id = request
            .account_id
            .parse()
            .map_err(|_| Status::invalid_argument("Invalid account ID"))?;

        // NOTE we probably need a way to write the state before publishing, so that we can trigger
        // features before it starts
        let indexer_config = self
            .registry
            .fetch_indexer(account_id, request.function_name)
            .await
            .map_err(|_| Status::not_found("Indexer not found"))?;

        self.indexer_state_manager
            .set_enabled(&indexer_config, true)
            .await
            .map_err(|_| Status::internal("Failed to enable indexer"))?;

        tracing::info!("Enabled indexer");

        Ok(Response::new(indexer_manager::EnableIndexerResponse {
            success: true,
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
    ) -> Result<Response<indexer_manager::DisableIndexerResponse>, Status> {
        let request = request.into_inner();

        let account_id = request
            .account_id
            .parse()
            .map_err(|_| Status::invalid_argument("Invalid account ID"))?;

        let indexer_config = self
            .registry
            .fetch_indexer(account_id, request.function_name)
            .await
            .map_err(|_| Status::not_found("Indexer not found"))?;

        self.indexer_state_manager
            .set_enabled(&indexer_config, false)
            .await
            .map_err(|_| Status::internal("Failed to disable indexer"))?;

        tracing::info!("Disabled indexer");

        Ok(Response::new(indexer_manager::DisableIndexerResponse {
            success: true,
        }))
    }

    async fn list(
        &self,
        _request: Request<indexer_manager::Empty>,
    ) -> Result<Response<indexer_manager::ListIndexersResponse>, Status> {
        let regsitry = self
            .registry
            .fetch()
            .await
            .map_err(|_| Status::internal("Failed to fetch registry"))?;

        let mut indexers = vec![];

        for indexer_config in regsitry.iter() {
            let state = self
                .indexer_state_manager
                .get_state(indexer_config)
                .await
                .unwrap();

            indexers.push(indexer_manager::IndexerState {
                account_id: indexer_config.account_id.to_string(),
                function_name: indexer_config.function_name.clone(),
                enabled: state.enabled,
            });
        }

        Ok(Response::new(indexer_manager::ListIndexersResponse {
            indexers,
        }))
    }
}
