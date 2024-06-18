#![cfg_attr(test, allow(dead_code))]

use near_primitives::types::AccountId;

pub use runner::data_layer::TaskStatus;

use anyhow::Context;
use runner::data_layer::data_layer_client::DataLayerClient;
use runner::data_layer::{DeprovisionRequest, GetTaskStatusRequest, ProvisionRequest};
use tonic::transport::channel::Channel;
use tonic::Request;

use crate::indexer_config::IndexerConfig;

#[cfg(not(test))]
pub use DataLayerHandlerImpl as DataLayerHandler;
#[cfg(test)]
pub use MockDataLayerHandlerImpl as DataLayerHandler;

type TaskId = String;

pub struct DataLayerHandlerImpl {
    client: DataLayerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl DataLayerHandlerImpl {
    pub fn connect(runner_url: &str) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(runner_url.to_string())
            .context("Runner URL is invalid")?
            .connect_lazy();
        let client = DataLayerClient::new(channel);

        Ok(Self { client })
    }

    pub async fn start_provisioning_task(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<TaskId> {
        let request = ProvisionRequest {
            account_id: indexer_config.account_id.to_string(),
            function_name: indexer_config.function_name.clone(),
            schema: indexer_config.schema.clone(),
        };

        let response = self
            .client
            .clone()
            .start_provisioning_task(Request::new(request))
            .await?;

        Ok(response.into_inner().task_id)
    }

    pub async fn start_deprovisioning_task(
        &self,
        account_id: AccountId,
        function_name: String,
    ) -> anyhow::Result<TaskId> {
        let request = DeprovisionRequest {
            account_id: account_id.to_string(),
            function_name,
        };

        let response = self
            .client
            .clone()
            .start_deprovisioning_task(Request::new(request))
            .await?;

        Ok(response.into_inner().task_id)
    }

    pub async fn get_task_status(&self, task_id: TaskId) -> anyhow::Result<TaskStatus> {
        let request = GetTaskStatusRequest { task_id };

        let response = self
            .client
            .clone()
            .get_task_status(Request::new(request))
            .await;

        if let Err(error) = response {
            if error.code() == tonic::Code::NotFound {
                return Ok(TaskStatus::Failed);
            }

            return Err(error.into());
        }

        let status = match response.unwrap().into_inner().status {
            1 => TaskStatus::Pending,
            2 => TaskStatus::Complete,
            3 => TaskStatus::Failed,
            _ => anyhow::bail!("Received invalid task status"),
        };

        Ok(status)
    }
}
