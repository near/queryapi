#![cfg_attr(test, allow(dead_code))]

use near_primitives::types::AccountId;
pub use runner::ExecutorInfo;

use anyhow::Context;
use runner::runner_client::RunnerClient;
use runner::{
    ExecutionState, GetExecutorRequest, StartExecutorRequest, StartExecutorResponse,
    StopExecutorRequest, StopExecutorResponse,
};
use tonic::transport::channel::Channel;

use crate::indexer_config::IndexerConfig;
use crate::redis::KeyProvider;

const RESTART_TIMEOUT_SECONDS: u64 = 600;

#[cfg(not(test))]
use ExecutorsClientWrapperImpl as ExecutorsClientWrapper;
#[cfg(test)]
use MockExecutorsClientWrapperImpl as ExecutorsClientWrapper;

#[derive(Clone)]
struct ExecutorsClientWrapperImpl {
    inner: RunnerClient<Channel>,
}

#[cfg_attr(test, mockall::automock)]
impl ExecutorsClientWrapperImpl {
    pub fn new(inner: RunnerClient<Channel>) -> Self {
        Self { inner }
    }

    pub async fn get_executor<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<ExecutorInfo>, tonic::Status>
    where
        R: tonic::IntoRequest<GetExecutorRequest> + 'static,
    {
        self.inner.clone().get_executor(request).await
    }

    pub async fn start_executor<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<StartExecutorResponse>, tonic::Status>
    where
        R: tonic::IntoRequest<StartExecutorRequest> + 'static,
    {
        self.inner.clone().start_executor(request).await
    }

    pub async fn stop_executor<R>(
        &self,
        request: R,
    ) -> std::result::Result<tonic::Response<StopExecutorResponse>, tonic::Status>
    where
        R: tonic::IntoRequest<StopExecutorRequest> + 'static,
    {
        self.inner.clone().stop_executor(request).await
    }
}

#[cfg(not(test))]
pub use ExecutorsHandlerImpl as ExecutorsHandler;
#[cfg(test)]
pub use MockExecutorsHandlerImpl as ExecutorsHandler;

#[derive(Clone)]
pub struct ExecutorsHandlerImpl {
    client: ExecutorsClientWrapper,
}

#[cfg_attr(test, mockall::automock)]
impl ExecutorsHandlerImpl {
    pub fn connect(runner_url: &str) -> anyhow::Result<Self> {
        let channel = Channel::from_shared(runner_url.to_string())
            .context("Runner URL is invalid")?
            .connect_lazy();
        let client = RunnerClient::new(channel);

        Ok(Self {
            client: ExecutorsClientWrapper::new(client),
        })
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

        match self.client.get_executor(request).await {
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

        let response = self.client.start_executor(request).await.context(format!(
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
            .stop_executor(request)
            .await
            .context(format!("Failed to stop executor: {executor_id}"))?;

        tracing::debug!(executor_id, "Stop executor response: {:#?}", response);

        Ok(())
    }

    async fn ensure_healthy(
        &self,
        config: &IndexerConfig,
        executor: ExecutorInfo,
    ) -> anyhow::Result<()> {
        if let Some(health) = executor.health {
            if !matches!(
                health.execution_state.try_into(),
                Ok(ExecutionState::Stalled)
            ) {
                return Ok(());
            }
        }

        tracing::info!("Restarting stalled executor after {RESTART_TIMEOUT_SECONDS} seconds");

        self.stop(executor.executor_id).await?;
        tokio::time::sleep(tokio::time::Duration::from_secs(RESTART_TIMEOUT_SECONDS)).await;
        self.start(config).await?;

        Ok(())
    }

    pub async fn synchronise(&self, config: &IndexerConfig) -> anyhow::Result<()> {
        let executor = self
            .get(config.account_id.clone(), config.function_name.clone())
            .await?;

        if let Some(executor) = executor {
            if executor.version == config.get_registry_version() {
                self.ensure_healthy(config, executor).await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    use mockall::predicate::*;
    use tonic::Response;

    impl Clone for MockExecutorsClientWrapperImpl {
        fn clone(&self) -> Self {
            Self::default()
        }
    }

    impl Clone for MockExecutorsHandlerImpl {
        fn clone(&self) -> Self {
            Self::default()
        }
    }

    #[tokio::test]
    async fn resumes_stopped_executors() {
        let config = IndexerConfig::default();

        let mut mock_client = ExecutorsClientWrapper::default();
        mock_client
            .expect_get_executor::<GetExecutorRequest>()
            .with(eq(GetExecutorRequest {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(|_| Err(tonic::Status::not_found("not found")))
            .once();
        mock_client
            .expect_start_executor::<StartExecutorRequest>()
            .with(eq(StartExecutorRequest {
                code: config.code.clone(),
                schema: config.schema.clone(),
                redis_stream: config.get_redis_stream_key(),
                version: config.get_registry_version(),
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartExecutorResponse {
                    executor_id: "executor_id".to_string(),
                }))
            })
            .once();

        let handler = ExecutorsHandlerImpl {
            client: mock_client,
        };

        handler.synchronise(&config).await.unwrap()
    }

    #[tokio::test]
    async fn reconfigures_outdated_executors() {
        let config = IndexerConfig::default();

        let executor = ExecutorInfo {
            account_id: config.account_id.to_string(),
            function_name: config.function_name.clone(),
            executor_id: "executor_id".to_string(),
            version: config.get_registry_version() - 1,
            health: None,
        };

        let mut mock_client = ExecutorsClientWrapper::default();
        mock_client
            .expect_stop_executor::<StopExecutorRequest>()
            .with(eq(StopExecutorRequest {
                executor_id: executor.executor_id.clone(),
            }))
            .returning(|_| {
                Ok(Response::new(StopExecutorResponse {
                    executor_id: "executor_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_start_executor::<StartExecutorRequest>()
            .with(eq(StartExecutorRequest {
                code: config.code.clone(),
                schema: config.schema.clone(),
                redis_stream: config.get_redis_stream_key(),
                version: config.get_registry_version(),
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartExecutorResponse {
                    executor_id: "executor_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_executor::<GetExecutorRequest>()
            .with(always())
            .returning(move |_| Ok(Response::new(executor.clone())))
            .once();

        let handler = ExecutorsHandlerImpl {
            client: mock_client,
        };

        handler.synchronise(&config).await.unwrap()
    }

    #[tokio::test]
    async fn restarts_unhealthy_executors() {
        tokio::time::pause();

        let config = IndexerConfig::default();

        let executor = ExecutorInfo {
            account_id: config.account_id.to_string(),
            function_name: config.function_name.clone(),
            executor_id: "executor_id".to_string(),
            version: config.get_registry_version(),
            health: Some(runner::Health {
                execution_state: runner::ExecutionState::Stalled.into(),
            }),
        };

        let mut mock_client = ExecutorsClientWrapper::default();
        mock_client
            .expect_stop_executor::<StopExecutorRequest>()
            .with(eq(StopExecutorRequest {
                executor_id: executor.executor_id.clone(),
            }))
            .returning(|_| {
                Ok(Response::new(StopExecutorResponse {
                    executor_id: "executor_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_start_executor::<StartExecutorRequest>()
            .with(eq(StartExecutorRequest {
                code: config.code.clone(),
                schema: config.schema.clone(),
                redis_stream: config.get_redis_stream_key(),
                version: config.get_registry_version(),
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
            }))
            .returning(|_| {
                Ok(tonic::Response::new(StartExecutorResponse {
                    executor_id: "executor_id".to_string(),
                }))
            })
            .once();
        mock_client
            .expect_get_executor::<GetExecutorRequest>()
            .with(always())
            .returning(move |_| Ok(Response::new(executor.clone())))
            .once();

        let handler = ExecutorsHandlerImpl {
            client: mock_client,
        };

        handler.synchronise(&config).await.unwrap()
    }

    #[tokio::test]
    async fn ignores_healthy_executors() {
        tokio::time::pause();

        let config = IndexerConfig::default();

        let healthy_states = vec![
            runner::ExecutionState::Running,
            runner::ExecutionState::Failing,
            runner::ExecutionState::Waiting,
            runner::ExecutionState::Stopped,
        ];

        for healthy_state in healthy_states {
            let executor = ExecutorInfo {
                account_id: config.account_id.to_string(),
                function_name: config.function_name.clone(),
                executor_id: "executor_id".to_string(),
                version: config.get_registry_version(),
                health: Some(runner::Health {
                    execution_state: healthy_state.into(),
                }),
            };

            let mut mock_client = ExecutorsClientWrapper::default();
            mock_client
                .expect_stop_executor::<StopExecutorRequest>()
                .never();
            mock_client
                .expect_start_executor::<StartExecutorRequest>()
                .never();
            mock_client
                .expect_get_executor::<GetExecutorRequest>()
                .with(always())
                .returning(move |_| Ok(Response::new(executor.clone())));

            let handler = ExecutorsHandlerImpl {
                client: mock_client,
            };

            handler.synchronise(&config).await.unwrap()
        }
    }
}
