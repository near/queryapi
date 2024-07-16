#![cfg_attr(test, allow(dead_code))]

use near_primitives::types::AccountId;
pub use runner::ExecutorInfo;

use anyhow::Context;
use runner::runner_client::RunnerClient;
use runner::{GetExecutorRequest, ListExecutorsRequest, StartExecutorRequest, StopExecutorRequest};
use tonic::transport::channel::Channel;
use tonic::Request;

use crate::indexer_config::IndexerConfig;
use crate::redis::KeyProvider;
use crate::utils::exponential_retry;

#[derive(Clone)]
pub struct ExecutorsHandler {
    client: RunnerClient<Channel>,
}

impl ExecutorsHandler {
    pub fn connect(runner_url: &str) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(runner_url.to_string())
            .context("Runner URL is invalid")?
            .connect_lazy();
        let client = RunnerClient::new(channel);

        Ok(Self { client })
    }

    pub async fn list(&self) -> anyhow::Result<Vec<ExecutorInfo>> {
        exponential_retry(|| async {
            let response = self
                .client
                .clone()
                .list_executors(Request::new(ListExecutorsRequest {}))
                .await
                .context("Failed to list executors")?;

            let executors = response.into_inner().executors;

            tracing::debug!("List executors response: {:#?}", executors);

            Ok(executors)
        })
        .await
    }

    pub async fn get(
        &self,
        account_id: AccountId,
        function_name: String,
    ) -> anyhow::Result<Option<ExecutorInfo>> {
        let request = GetExecutorRequest {
            account_id: account_id.to_string(),
            function_name: function_name.clone(),
        };

        match self
            .client
            .clone()
            .get_executor(Request::new(request))
            .await
        {
            Ok(response) => Ok(Some(response.into_inner())),
            Err(status) if status.code() == tonic::Code::NotFound => Ok(None),
            Err(err) => Err(err).context(format!(
                "Failed to get executor for account {} and name {}",
                account_id, function_name
            )),
        }
    }

    pub async fn start(&self, indexer_config: &IndexerConfig) -> anyhow::Result<()> {
        let request = StartExecutorRequest {
            code: indexer_config.code.clone(),
            schema: indexer_config.schema.clone(),
            redis_stream: indexer_config.get_redis_stream_key(),
            version: indexer_config.get_registry_version(),
            account_id: indexer_config.account_id.to_string(),
            function_name: indexer_config.function_name.clone(),
        };

        let response = self
            .client
            .clone()
            .start_executor(Request::new(request.clone()))
            .await
            .context(format!(
                "Failed to start executor: {}",
                indexer_config.get_full_name()
            ))?;

        tracing::debug!(
            account_id = indexer_config.account_id.as_str(),
            function_name = indexer_config.function_name,
            version = indexer_config.get_registry_version(),
            "Start executors response: {:#?}",
            response
        );

        Ok(())
    }

    pub async fn stop(&self, executor_id: String) -> anyhow::Result<()> {
        let request = StopExecutorRequest {
            executor_id: executor_id.clone(),
        };

        let response = self
            .client
            .clone()
            .stop_executor(Request::new(request.clone()))
            .await
            .context(format!("Failed to stop executor: {executor_id}"))?;

        tracing::debug!(executor_id, "Stop executor response: {:#?}", response);

        Ok(())
    }

    pub async fn synchronise_executor(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        let executor = self
            .get(config.account_id.clone(), config.function_name.clone())
            .await?;

        if let Some(executor) = executor {
            if executor.version == config.get_registry_version() {
                return Ok(());
            }

            tracing::info!(
                account_id = config.account_id.as_str(),
                function_name = config.function_name,
                version = executor.version,
                "Stopping outdated executor"
            );

            self.stop(executor.executor_id).await?;
        }

        tracing::info!(
            account_id = config.account_id.as_str(),
            function_name = config.function_name,
            version = config.get_registry_version(),
            "Starting executor"
        );

        self.start(config).await?;

        Ok(())
    }

    pub async fn stop_if_needed(
        &self,
        account_id: AccountId,
        function_name: String,
    ) -> anyhow::Result<()> {
        if let Some(executor) = self.get(account_id, function_name).await? {
            tracing::info!("Stopping executor");
            self.stop(executor.executor_id).await?;
        }

        Ok(())
    }
}
