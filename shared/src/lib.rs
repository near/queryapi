pub use aws_sdk_sqs::{error::SendMessageError, Client as QueueClient, Region};
pub use base64;
pub use borsh::{BorshDeserialize, BorshSerialize};
pub use clap::{Parser, Subcommand};
pub use dotenv;
use tracing_subscriber::EnvFilter;

use near_jsonrpc_client::{methods, JsonRpcClient};
use near_lake_framework::near_indexer_primitives::types::{BlockReference, Finality};

pub mod types;

#[derive(Parser, Debug, Clone)]
#[clap(
    version,
    author,
    about,
    disable_help_subcommand(true),
    propagate_version(true),
    next_line_help(true)
)]
pub struct Opts {
    #[clap(long, default_value = "redis://127.0.0.1", env)]
    pub redis_connection_string: String,
    #[clap(long, env)]
    pub database_url: String,
    #[clap(long, env)]
    pub lake_aws_access_key: String,
    #[clap(long, env)]
    pub lake_aws_secret_access_key: String,
    #[clap(long, env)]
    pub queue_aws_access_key: String,
    #[clap(long, env)]
    pub queue_aws_secret_access_key: String,
    #[clap(long, env)]
    pub queue_url: String,
    #[clap(subcommand)]
    pub chain_id: ChainId,
}

#[derive(Subcommand, Debug, Clone)]
pub enum ChainId {
    #[clap(subcommand)]
    Mainnet(StartOptions),
    #[clap(subcommand)]
    Testnet(StartOptions),
}

#[derive(Subcommand, Debug, Clone)]
pub enum StartOptions {
    FromBlock { height: u64 },
    FromInterruption,
    FromLatest,
}

impl Opts {
    pub fn chain_id(&self) -> crate::types::primitives::ChainId {
        match self.chain_id {
            ChainId::Mainnet(_) => crate::types::primitives::ChainId::Mainnet,
            ChainId::Testnet(_) => crate::types::primitives::ChainId::Testnet,
        }
    }

    /// Returns [StartOptions] for current [Opts]
    pub fn start_options(&self) -> &StartOptions {
        match &self.chain_id {
            ChainId::Mainnet(start_options) | ChainId::Testnet(start_options) => start_options,
        }
    }

    // Creates AWS Credentials for NEAR Lake
    fn lake_credentials(&self) -> aws_types::credentials::SharedCredentialsProvider {
        let provider = aws_types::Credentials::new(
            self.lake_aws_access_key.clone(),
            self.lake_aws_secret_access_key.clone(),
            None,
            None,
            "alertexer_lake",
        );
        aws_types::credentials::SharedCredentialsProvider::new(provider)
    }

    // Creates AWS Credentials for SQS Queue
    fn queue_credentials(&self) -> aws_types::credentials::SharedCredentialsProvider {
        let provider = aws_types::Credentials::new(
            self.queue_aws_access_key.clone(),
            self.queue_aws_secret_access_key.clone(),
            None,
            None,
            "alertexer_queue",
        );
        aws_types::credentials::SharedCredentialsProvider::new(provider)
    }

    /// Creates AWS Shared Config for NEAR Lake
    pub fn lake_aws_sdk_config(&self) -> aws_types::sdk_config::SdkConfig {
        aws_types::sdk_config::SdkConfig::builder()
            .credentials_provider(self.lake_credentials())
            .region(aws_types::region::Region::new("eu-central-1"))
            .build()
    }

    /// Creates AWS Shared Config for Alertexer SQS queue
    pub fn queue_aws_sdk_config(&self) -> aws_types::sdk_config::SdkConfig {
        aws_types::sdk_config::SdkConfig::builder()
            .credentials_provider(self.queue_credentials())
            .region(aws_types::region::Region::new("eu-central-1"))
            .build()
    }

    /// Creates AWS SQS Client for Alertexer SQS
    pub fn queue_client(&self) -> aws_sdk_sqs::Client {
        let shared_config = self.queue_aws_sdk_config();
        aws_sdk_sqs::Client::new(&shared_config)
    }
}

impl Opts {
    pub async fn to_lake_config(self) -> near_lake_framework::LakeConfig {
        let s3_config = aws_sdk_s3::config::Builder::from(&self.lake_aws_sdk_config()).build();

        let config_builder = near_lake_framework::LakeConfigBuilder::default().s3_config(s3_config);

        match &self.chain_id {
            ChainId::Mainnet(_) => config_builder
                .mainnet()
                .start_block_height(get_start_block_height(&self).await),
            ChainId::Testnet(_) => config_builder
                .testnet()
                .start_block_height(get_start_block_height(&self).await),
        }
        .build()
        .expect("Failed to build LakeConfig")
    }
}

// TODO: refactor to read from Redis once `storage` is extracted to a separate crate
async fn get_start_block_height(opts: &Opts) -> u64 {
    match opts.start_options() {
        StartOptions::FromBlock { height } => *height,
        StartOptions::FromInterruption => {
            let redis_connection_manager = match storage::connect(&opts.redis_connection_string)
                .await
            {
                Ok(connection_manager) => connection_manager,
                Err(err) => {
                    tracing::warn!(
                        target: "alertexer",
                        "Failed to connect to Redis to get last synced block, failing to the latest...\n{:#?}",
                        err,
                    );
                    return final_block_height().await;
                }
            };
            match storage::get_last_indexed_block(&redis_connection_manager).await {
                Ok(last_indexed_block) => last_indexed_block,
                Err(err) => {
                    tracing::warn!(
                        target: "alertexer",
                        "Failed to get last indexer block from Redis. Failing to the latest one...\n{:#?}",
                        err
                    );
                    final_block_height().await
                }
            }
        }
        StartOptions::FromLatest => final_block_height().await,
    }
}

pub fn init_tracing() {
    let mut env_filter = EnvFilter::new("near_lake_framework=info,alertexer=info,stats=info");

    if let Ok(rust_log) = std::env::var("RUST_LOG") {
        if !rust_log.is_empty() {
            for directive in rust_log.split(',').filter_map(|s| match s.parse() {
                Ok(directive) => Some(directive),
                Err(err) => {
                    eprintln!("Ignoring directive `{}`: {}", s, err);
                    None
                }
            }) {
                env_filter = env_filter.add_directive(directive);
            }
        }
    }

    tracing_subscriber::fmt::Subscriber::builder()
        .with_env_filter(env_filter)
        .with_writer(std::io::stderr)
        .init();
}

pub async fn send_to_the_queue(
    client: &aws_sdk_sqs::Client,
    queue_url: String,
    message: types::primitives::AlertQueueMessage,
) -> anyhow::Result<()> {
    tracing::info!(
        target: "alertexer",
        "Sending alert to the queue\n{:#?}",
        message
    );
    let message_serialized = base64::encode(message.try_to_vec()?);

    eprintln!("{}", &message_serialized);

    let rsp = client
        .send_message()
        .queue_url(queue_url)
        .message_body(message_serialized)
        .send()
        .await?;
    tracing::debug!(
        target: "alertexer",
        "Response from sending a message to SQS\n{:#?}",
        rsp
    );
    Ok(())
}

async fn final_block_height() -> u64 {
    let client = JsonRpcClient::connect("https://rpc.mainnet.near.org");
    let request = methods::block::RpcBlockRequest {
        block_reference: BlockReference::Finality(Finality::Final),
    };

    let latest_block = client.call(request).await.unwrap();

    latest_block.header.height
}
