use anyhow::Context;
use tonic::transport::channel::Channel;
use tonic::Request;

use runner::runner_client::RunnerClient;
use runner::{ExecutorInfo, ListExecutorsRequest, StartExecutorRequest, StopExecutorRequest};

#[cfg(not(test))]
pub use ExecutorsHandlerImpl as ExecutorsHandler;
#[cfg(test)]
pub use MockExecutorsHandlerImpl as ExecutorsHandler;

pub struct ExecutorsHandlerImpl {
    client: RunnerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl ExecutorsHandlerImpl {
    pub async fn connect() -> anyhow::Result<Self> {
        let client = RunnerClient::connect("http://localhost:50007")
            .await
            .context("Unable to connect to Runner")?;

        Ok(Self { client })
    }

    pub async fn list(&mut self) -> anyhow::Result<Vec<ExecutorInfo>> {
        let response = self
            .client
            .list_executors(Request::new(ListExecutorsRequest {}))
            .await?;

        Ok(response.into_inner().executors)
    }

    pub async fn start(
        &mut self,
        account_id: String,
        function_name: String,
        code: String,
        schema: String,
        redis_stream: String,
        version: u64,
    ) -> anyhow::Result<()> {
        let request = Request::new(StartExecutorRequest {
            account_id,
            function_name,
            code,
            schema,
            redis_stream,
            version,
        });

        tracing::debug!("Sending start executor request: {:#?}", request);

        self.client.start_executor(request).await?;

        Ok(())
    }

    pub async fn stop(&mut self, executor_id: String) -> anyhow::Result<()> {
        let request = Request::new(StopExecutorRequest { executor_id });

        tracing::debug!("Sending stop executor request: {:#?}", request);

        self.client.stop_executor(request).await?;

        Ok(())
    }
}
