use anyhow::Context;
use runner::runner_client::RunnerClient;
use runner::{ExecutorInfo, ListExecutorsRequest, StartExecutorRequest, StopExecutorRequest};
use tonic::transport::channel::Channel;
use tonic::Request;

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
    pub fn connect(runner_url: String) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(runner_url)
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

            Ok(response.into_inner().executors)
        })
        .await
    }

    pub async fn start(
        &self,
        account_id: String,
        function_name: String,
        code: String,
        schema: String,
        redis_stream: String,
        version: u64,
    ) -> anyhow::Result<()> {
        let request = StartExecutorRequest {
            code,
            schema,
            redis_stream,
            version,
            account_id: account_id.clone(),
            function_name: function_name.clone(),
        };

        tracing::debug!("Sending start executor request: {:#?}", request);

        let _ = self
            .client
            .clone()
            .start_executor(Request::new(request.clone()))
            .await
            .map_err(|error| {
                tracing::error!(
                    account_id,
                    function_name,
                    "Failed to start executor\n{error:?}"
                );
            });

        Ok(())
    }

    pub async fn stop(&self, executor_id: String) -> anyhow::Result<()> {
        let request = StopExecutorRequest {
            executor_id: executor_id.clone(),
        };

        tracing::debug!("Sending stop executor request: {:#?}", request);

        let _ = self
            .client
            .clone()
            .stop_executor(Request::new(request.clone()))
            .await
            .map_err(|e| {
                tracing::error!(executor_id, "Failed to stop executor\n{e:?}");
            });

        Ok(())
    }
}
