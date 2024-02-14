#![cfg_attr(test, allow(dead_code))]

pub use runner::ExecutorInfo;

use anyhow::Context;
use runner::runner_client::RunnerClient;
use runner::{ListExecutorsRequest, StartExecutorRequest, StopExecutorRequest};
use tonic::transport::channel::Channel;
use tonic::Request;

use crate::indexer_config::IndexerConfig;
use crate::utils::exponential_retry;

#[cfg(not(test))]
pub use ExecutorsHandlerImpl as ExecutorsHandler;
#[cfg(test)]
pub use MockExecutorsHandlerImpl as ExecutorsHandler;

pub struct ExecutorsHandlerImpl {
    client: RunnerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl ExecutorsHandlerImpl {
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
            .map_err(|error| {
                tracing::error!(
                    account_id = indexer_config.account_id.as_str(),
                    function_name = indexer_config.function_name,
                    "Failed to start executor\n{error:?}"
                );
            });

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
            .await?;

        tracing::debug!(executor_id, "Stop executor response: {:#?}", response);

        Ok(())
    }
}
