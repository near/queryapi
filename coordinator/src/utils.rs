use std::time::Duration;

use futures_util::future::Future;

const INITIAL_DELAY_SECONDS: u64 = 1;

pub async fn exponential_retry<F, Fut, T, E>(operation: F) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut attempts = 1;
    let mut delay = Duration::from_secs(INITIAL_DELAY_SECONDS);

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(error) => {
                if attempts == 1 || attempts % 5 == 0 {
                    tracing::warn!("Encountered error {attempts} time(s). Retrying...\n{error:?}")
                }

                tokio::time::sleep(delay).await;

                attempts += 1;
                delay *= 2;
            }
        }
    }
}
