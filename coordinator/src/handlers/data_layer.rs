#![cfg_attr(test, allow(dead_code))]

use near_primitives::types::AccountId;

pub use runner::data_layer::TaskStatus;

use anyhow::Context;
use runner::data_layer::data_layer_client::DataLayerClient;
use runner::data_layer::{DeprovisionRequest, GetTaskStatusRequest, ProvisionRequest};
use tonic::transport::channel::Channel;
use tonic::{Request, Status};

use crate::indexer_config::IndexerConfig;

type TaskId = String;

#[derive(Clone)]
pub struct DataLayerHandler {
    client: DataLayerClient<Channel>,
}

impl DataLayerHandler {
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
    ) -> Result<TaskId, Status> {
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

    pub async fn ensure_provisioned(&self, indexer_config: &IndexerConfig) -> anyhow::Result<()> {
        tracing::info!(account_id = ?indexer_config.account_id, function_name = ?indexer_config.function_name, "Provisioning data layer");

        let start_task_result = self.start_provisioning_task(indexer_config).await;

        if let Err(error) = start_task_result {
            // Already provisioned
            if error.code() == tonic::Code::FailedPrecondition {
                return Ok(());
            }

            return Err(error.into());
        }

        let task_id = start_task_result.unwrap();

        let mut iterations = 0;
        let delay_seconds = 1;

        loop {
            if self.get_task_status(task_id.clone()).await? == TaskStatus::Complete {
                break;
            }

            tokio::time::sleep(std::time::Duration::from_secs(1)).await;

            iterations += 1;

            if iterations * delay_seconds % 60 == 0 {
                tracing::warn!(
                    ?indexer_config.account_id,
                    ?indexer_config.function_name,
                    "Still waiting for provisioning to complete after {} seconds",
                    iterations * delay_seconds
                );
            }
        }

        Ok(())
    }

    pub async fn ensure_deprovisioned(
        &self,
        account_id: AccountId,
        function_name: String,
    ) -> anyhow::Result<()> {
        tracing::info!(?account_id, ?function_name, "Deprovisioning data layer");

        let task_id = self
            .start_deprovisioning_task(account_id.clone(), function_name.clone())
            .await?;

        let mut iterations = 0;
        let delay_seconds = 1;

        loop {
            if self.get_task_status(task_id.clone()).await? == TaskStatus::Complete {
                break;
            }

            tokio::time::sleep(std::time::Duration::from_secs(delay_seconds)).await;

            iterations += 1;

            if iterations * delay_seconds % 60 == 0 {
                tracing::warn!(
                    ?account_id,
                    ?function_name,
                    "Still waiting for deprovisioning to complete after {} seconds",
                    iterations * delay_seconds
                );
            }
        }

        Ok(())
    }
}
