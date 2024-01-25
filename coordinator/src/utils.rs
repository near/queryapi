use std::{ops::Mul, time::Duration};

use futures_util::future::Future;

const INITIAL_DELAY_SECONDS: Duration = Duration::from_secs(1);
const MAXIMUM_DELAY_SECONDS: Duration = Duration::from_secs(30);

pub async fn exponential_retry<F, Fut, T, E>(operation: F) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut attempts = 1;
    let mut delay = INITIAL_DELAY_SECONDS;

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(error) => {
                if attempts == 1 || attempts % 5 == 0 {
                    tracing::warn!("Encountered error {attempts} time(s). Retrying...\n{error:?}")
                }

                tokio::time::sleep(delay).await;

                attempts += 1;
                delay = delay.mul(2).min(MAXIMUM_DELAY_SECONDS);
            }
        }
    }
}
