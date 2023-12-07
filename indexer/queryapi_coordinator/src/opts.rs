pub use base64;
pub use borsh::{self, BorshDeserialize, BorshSerialize};
pub use clap::{Parser, Subcommand};
pub use dotenv;
use tracing_subscriber::EnvFilter;

use near_jsonrpc_client::{methods, JsonRpcClient};
use near_lake_framework::near_indexer_primitives::types::{BlockReference, Finality};

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
    /// Connection string to connect to the Redis instance for cache. Default: "redis://127.0.0.1"
    #[clap(long, env)]
    pub redis_connection_string: String,
    /// AWS Access Key with the rights to read from AWS S3
    #[clap(long, env)]
    pub aws_access_key_id: String,
    /// AWS Secret Access Key with the rights to read from AWS S3
    #[clap(long, env)]
    pub aws_secret_access_key: String,
    /// AWS Region to use for S3
    #[clap(long, env, default_value = "eu-central-1")]
    pub aws_region: String,
    /// Registry contract to use
    #[clap(env)]
    pub registry_contract_id: String,
    /// Port to enable metrics/health service
    #[clap(env, default_value_t = 4000)]
    pub port: u16,
    /// Chain ID: testnet or mainnet
    #[clap(subcommand)]
    pub chain_id: ChainId,
}

#[derive(Subcommand, Debug, Clone)]
pub enum ChainId {
    #[clap(subcommand)]
    Mainnet(StartOptions),
    #[clap(subcommand)]
    Testnet(StartOptions),
    #[clap(subcommand)]
    Localnet(StartOptions),
}

#[derive(Subcommand, Debug, Clone)]
#[allow(clippy::enum_variant_names)]
pub enum StartOptions {
    FromBlock { height: u64 },
    FromInterruption,
    FromLatest,
}

impl Opts {
    pub fn chain_id(&self) -> indexer_rules_engine::types::indexer_rule_match::ChainId {
        match self.chain_id {
            ChainId::Mainnet(_) => {
                indexer_rules_engine::types::indexer_rule_match::ChainId::Mainnet
            }
            ChainId::Testnet(_) => {
                indexer_rules_engine::types::indexer_rule_match::ChainId::Testnet
            }
            ChainId::Localnet(_) => {
                indexer_rules_engine::types::indexer_rule_match::ChainId::Localnet
            }
        }
    }

    /// Returns [StartOptions] for current [Opts]
    pub fn start_options(&self) -> &StartOptions {
        match &self.chain_id {
            ChainId::Mainnet(start_options) | ChainId::Testnet(start_options) | ChainId::Localnet(start_options) => start_options,
        }
    }

    pub fn rpc_url(&self) -> String {
        // To query metadata (timestamp) about blocks more than 5 epochs old we need an archival node
        match self.chain_id {
            ChainId::Mainnet(_) => "https://archival-rpc.mainnet.near.org".to_owned(), //https://rpc.mainnet.near.org",
            ChainId::Testnet(_) => "https://archival-rpc.testnet.near.org".to_owned(),
            ChainId::Localnet(_) => std::env::var("RPC_ADDRESS").unwrap()
        }
    }
}

impl Opts {
    pub async fn to_lake_config(&self) -> near_lake_framework::LakeConfig {
        let config_builder = near_lake_framework::LakeConfigBuilder::default();

        match &self.chain_id {
            ChainId::Mainnet(_) => config_builder
                .mainnet()
                .start_block_height(get_start_block_height(self).await),
            ChainId::Testnet(_) => config_builder
                .testnet()
                .start_block_height(get_start_block_height(self).await),
            ChainId::Localnet(_) => {
                let aws_config = aws_config::from_env().load().await;
                let mut s3_conf = aws_sdk_s3::config::Builder::from(&aws_config);
                s3_conf = s3_conf.endpoint_url(std::env::var("S3_URL").unwrap());
                
                config_builder
                    .s3_config(s3_conf.build())
                    .s3_region_name(std::env::var("AWS_REGION").unwrap_or("us-east-1".to_string()))
                    .s3_bucket_name(std::env::var("S3_BUCKET_NAME").unwrap_or("near-lake-custom".to_string()))
                    .start_block_height(get_start_block_height(self).await)
                // config_builder
                //     .mainnet()
                //     .start_block_height(get_start_block_height(self).await)
            }
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
                        target: crate::INDEXER,
                        "Failed to connect to Redis to get last synced block, failing to the latest...\n{:#?}",
                        err,
                    );
                    return final_block_height(opts).await;
                }
            };
            match storage::get_last_indexed_block(&redis_connection_manager).await {
                Ok(last_indexed_block) => last_indexed_block,
                Err(err) => {
                    tracing::warn!(
                        target: crate::INDEXER,
                        "Failed to get last indexer block from Redis. Failing to the latest one...\n{:#?}",
                        err
                    );
                    final_block_height(opts).await
                }
            }
        }
        StartOptions::FromLatest => final_block_height(opts).await,
    }
}

pub fn init_tracing() {
    let mut env_filter =
        EnvFilter::new("near_lake_framework=info,queryapi_coordinator=info,stats=info");

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

async fn final_block_height(opts: &Opts) -> u64 {
    let client = JsonRpcClient::connect(opts.rpc_url());
    let request = methods::block::RpcBlockRequest {
        block_reference: BlockReference::Finality(Finality::Final),
    };

    let latest_block = client.call(request).await.unwrap();

    latest_block.header.height
}
