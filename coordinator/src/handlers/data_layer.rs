#![cfg_attr(test, allow(dead_code))]

use near_primitives::types::AccountId;

pub use runner::data_layer::TaskStatus;

use anyhow::Context;
use runner::data_layer::data_layer_client::DataLayerClient;
use runner::data_layer::{
    DeprovisionRequest, GetTaskStatusRequest, GetTaskStatusResponse, ProvisionRequest,
    StartTaskResponse,
};
use tonic::transport::channel::Channel;
use tonic::Status;

use crate::indexer_config::IndexerConfig;

type TaskId = String;

const TASK_TIMEOUT_SECONDS: u64 = 600; // 10 minutes

#[cfg(not(test))]
use DataLayerClientWrapperImpl as DataLayerClientWrapper;
#[cfg(test)]
use MockDataLayerClientWrapperImpl as DataLayerClientWrapper;

#[derive(Clone)]
struct DataLayerClientWrapperImpl {
    inner: DataLayerClient<Channel>,
}

#[cfg(test)]
impl Clone for MockDataLayerClientWrapperImpl {
    fn clone(&self) -> Self {
        Self::default()
    }
}

#[cfg_attr(test, mockall::automock)]
impl DataLayerClientWrapperImpl {
    pub fn new(inner: DataLayerClient<Channel>) -> Self {
        Self { inner }
    }

    pub async fn start_provisioning_task<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<StartTaskResponse>, tonic::Status>
    where
        R: tonic::IntoRequest<ProvisionRequest> + 'static,
    {
        self.inner.clone().start_provisioning_task(request).await
    }

    pub async fn start_deprovisioning_task<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<StartTaskResponse>, tonic::Status>
    where
        R: tonic::IntoRequest<DeprovisionRequest> + 'static,
    {
        self.inner.clone().start_deprovisioning_task(request).await
    }

    pub async fn get_task_status<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<GetTaskStatusResponse>, tonic::Status>
    where
        R: tonic::IntoRequest<GetTaskStatusRequest> + 'static,
    {
        self.inner.clone().get_task_status(request).await
    }
}

#[cfg(not(test))]
pub use DataLayerHandlerImpl as DataLayerHandler;
#[cfg(test)]
pub use MockDataLayerHandlerImpl as DataLayerHandler;

#[derive(Clone)]
pub struct DataLayerHandlerImpl {
    client: DataLayerClientWrapper,
}

#[cfg_attr(test, mockall::automock)]
impl DataLayerHandlerImpl {
    pub fn connect(runner_url: &str) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(runner_url.to_string())
            .context("Runner URL is invalid")?
            .rate_limit(1, std::time::Duration::from_secs(5))
            .connect_lazy();
        let client = DataLayerClient::new(channel);

        Ok(Self {
            client: DataLayerClientWrapper::new(client),
        })
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

        let response = self.client.start_provisioning_task(request).await?;

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

        let response = self.client.start_deprovisioning_task(request).await?;

        Ok(response.into_inner().task_id)
    }

    pub async fn get_task_status(&self, task_id: TaskId) -> anyhow::Result<TaskStatus> {
        let request = GetTaskStatusRequest { task_id };

        let response = self.client.get_task_status(request).await;

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
        let start_task_result = self.start_provisioning_task(indexer_config).await;

        if let Err(error) = start_task_result {
            // Already provisioned
            if error.code() == tonic::Code::FailedPrecondition {
                return Ok(());
            }

            return Err(error.into());
        }

        let task_id = start_task_result.unwrap();

        tracing::info!(?task_id, "Started provisioning task");

        let mut iterations = 0;
        let delay_seconds = 1;

        loop {
            match self.get_task_status(task_id.clone()).await? {
                TaskStatus::Pending => {}
                TaskStatus::Complete => break,
                TaskStatus::Failed | TaskStatus::Unspecified => {
                    tracing::warn!("Provisioning task failed");
                    anyhow::bail!("Provisioning task failed")
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(delay_seconds)).await;

            iterations += 1;

            if iterations * delay_seconds % 10 == 0 {
                let delay = iterations * delay_seconds;

                if delay > TASK_TIMEOUT_SECONDS {
                    tracing::warn!("Provisioning task timed out");
                    anyhow::bail!("Provisioning task timed out");
                }

                tracing::warn!(
                    "Still waiting for provisioning to complete after {} seconds",
                    delay
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
        let task_id = self
            .start_deprovisioning_task(account_id.clone(), function_name.clone())
            .await?;

        tracing::info!(?task_id, "Started deprovisioning task");

        let mut iterations = 0;
        let delay_seconds = 1;

        loop {
            match self.get_task_status(task_id.clone()).await? {
                TaskStatus::Pending => {}
                TaskStatus::Complete => break,
                TaskStatus::Failed | TaskStatus::Unspecified => {
                    tracing::warn!("Deprovisioning task failed");
                    anyhow::bail!("Deprovisioning task failed")
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(delay_seconds)).await;

            iterations += 1;

            if iterations * delay_seconds % 10 == 0 {
                let delay = iterations * delay_seconds;

                if delay > TASK_TIMEOUT_SECONDS {
                    tracing::warn!("Deprovisioning task timed out");
                    anyhow::bail!("Deprovisioning task timed out");
                }

                tracing::warn!(
                    "Still waiting for Deprovisioning to complete after {} seconds",
                    delay
                );
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::redis::KeyProvider;

    use super::*;

    use mockall::predicate::*;

    impl Clone for MockDataLayerHandlerImpl {
        fn clone(&self) -> Self {
            Self::default()
        }
    }

    #[tokio::test]
    async fn provisions_data_layer() {
        let config = IndexerConfig::default();

        let mut mock_client = DataLayerClientWrapper::default();
        mock_client
            .expect_start_provisioning_task::<ProvisionRequest>()
            .with(eq(ProvisionRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                schema: config.schema.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartTaskResponse {
                    task_id: "task_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Pending.into(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Complete.into(),
                }))
            })
            .once();

        let handler = DataLayerHandlerImpl {
            client: mock_client,
        };

        handler.ensure_provisioned(&config).await.unwrap();
    }

    #[tokio::test]
    async fn timesout_provisioning_task() {
        tokio::time::pause();

        let config = IndexerConfig::default();

        let mut mock_client = DataLayerClientWrapper::default();
        mock_client
            .expect_start_provisioning_task::<ProvisionRequest>()
            .with(eq(ProvisionRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                schema: config.schema.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartTaskResponse {
                    task_id: "task_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Pending.into(),
                }))
            })
            .times(610);

        let handler = DataLayerHandlerImpl {
            client: mock_client,
        };

        let result = handler.ensure_provisioned(&config).await;

        assert_eq!(
            result.err().unwrap().to_string(),
            "Provisioning task timed out"
        );
    }

    #[tokio::test]
    async fn propagates_provisioning_failures() {
        let config = IndexerConfig::default();

        let mut mock_client = DataLayerClientWrapper::default();
        mock_client
            .expect_start_provisioning_task::<ProvisionRequest>()
            .with(eq(ProvisionRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                schema: config.schema.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartTaskResponse {
                    task_id: "task_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Failed.into(),
                }))
            })
            .once();

        let handler = DataLayerHandlerImpl {
            client: mock_client,
        };

        let result = handler.ensure_provisioned(&config).await;

        assert_eq!(
            result.err().unwrap().to_string(),
            "Provisioning task failed"
        );
    }

    #[tokio::test]
    async fn deprovisions_data_layer() {
        let config = IndexerConfig::default();

        let mut mock_client = DataLayerClientWrapper::default();
        mock_client
            .expect_start_deprovisioning_task::<DeprovisionRequest>()
            .with(eq(DeprovisionRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartTaskResponse {
                    task_id: "task_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Pending.into(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Complete.into(),
                }))
            })
            .once();

        let handler = DataLayerHandlerImpl {
            client: mock_client,
        };

        handler
            .ensure_deprovisioned(config.account_id, config.function_name)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn timesout_deprovisioning_task() {
        tokio::time::pause();

        let config = IndexerConfig::default();

        let mut mock_client = DataLayerClientWrapper::default();
        mock_client
            .expect_start_deprovisioning_task::<DeprovisionRequest>()
            .with(eq(DeprovisionRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartTaskResponse {
                    task_id: "task_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Pending.into(),
                }))
            })
            .times(610);

        let handler = DataLayerHandlerImpl {
            client: mock_client,
        };

        let result = handler
            .ensure_deprovisioned(config.account_id, config.function_name)
            .await;

        assert_eq!(
            result.err().unwrap().to_string(),
            "Deprovisioning task timed out"
        );
    }

    #[tokio::test]
    async fn propagates_deprovisioning_failures() {
        let config = IndexerConfig::default();

        let mut mock_client = DataLayerClientWrapper::default();
        mock_client
            .expect_start_deprovisioning_task::<DeprovisionRequest>()
            .with(eq(DeprovisionRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartTaskResponse {
                    task_id: "task_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_task_status::<GetTaskStatusRequest>()
            .with(eq(GetTaskStatusRequest {
                task_id: "task_id".to_string(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(GetTaskStatusResponse {
                    status: TaskStatus::Failed.into(),
                }))
            })
            .once();

        let handler = DataLayerHandlerImpl {
            client: mock_client,
        };

        let result = handler
            .ensure_deprovisioned(config.account_id, config.function_name)
            .await;

        assert_eq!(
            result.err().unwrap().to_string(),
            "Deprovisioning task failed"
        );
    }
}
