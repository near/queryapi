#![cfg_attr(test, allow(dead_code))]

pub use runner::data_layer::ProvisioningStatus;

use anyhow::Context;
use runner::data_layer::data_layer_client::DataLayerClient;
use runner::data_layer::{CheckProvisioningTaskStatusRequest, ProvisionRequest};
use tonic::transport::channel::Channel;
use tonic::{Request, Status};

use crate::indexer_config::IndexerConfig;

#[cfg(not(test))]
pub use DataLayerHandlerImpl as DataLayerHandler;
#[cfg(test)]
pub use MockDataLayerHandlerImpl as DataLayerHandler;

pub struct DataLayerHandlerImpl {
    client: DataLayerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl DataLayerHandlerImpl {
    pub fn from_env() -> anyhow::Result<Self> {
        let runner_url = std::env::var("RUNNER_URL").context("RUNNER_URL is not set")?;
        Self::connect(&runner_url)
    }

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
    ) -> anyhow::Result<ProvisioningStatus> {
        let request = ProvisionRequest {
            account_id: indexer_config.account_id.to_string(),
            function_name: indexer_config.function_name.clone(),
            schema: indexer_config.schema.clone(),
        };

        let response = self
            .client
            .clone()
            .start_provisioning_task(Request::new(request))
            .await;

        if let Err(error) = response {
            if error.code() == tonic::Code::AlreadyExists {
                return Ok(ProvisioningStatus::Pending);
            }

            return Err(error.into());
        }

        let status = match response.unwrap().into_inner().status {
            1 => ProvisioningStatus::Pending,
            2 => ProvisioningStatus::Complete,
            3 => ProvisioningStatus::Failed,
            _ => ProvisioningStatus::Unspecified,
        };

        Ok(status)
    }

    pub async fn check_provisioning_task_status(
        &self,
        indexer_config: &IndexerConfig,
    ) -> anyhow::Result<ProvisioningStatus> {
        let request = CheckProvisioningTaskStatusRequest {
            account_id: indexer_config.account_id.to_string(),
            function_name: indexer_config.function_name.clone(),
        };

        let response = self
            .client
            .clone()
            .check_provisioning_task_status(Request::new(request))
            .await?;

        let status = match response.into_inner().status {
            1 => ProvisioningStatus::Pending,
            2 => ProvisioningStatus::Complete,
            3 => ProvisioningStatus::Failed,
            _ => ProvisioningStatus::Unspecified,
        };

        Ok(status)
    }
}
