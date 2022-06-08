pub use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

pub use borsh::{BorshDeserialize, BorshSerialize};
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
    #[clap(long, default_value = "redis://127.0.0.1")]
    pub redis_connection_string: String,
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
}

impl Opts {
    pub fn start_options(&self) -> &StartOptions {
        match &self.chain_id {
            ChainId::Mainnet(args) | ChainId::Testnet(args) => args,
        }
    }
}

impl From<Opts> for near_lake_framework::LakeConfig {
    fn from(opts: Opts) -> Self {
        let config_builder = near_lake_framework::LakeConfigBuilder::default();

        match &opts.chain_id {
            ChainId::Mainnet(_) => config_builder
                .mainnet()
                .start_block_height(get_start_block_height(&opts)),
            ChainId::Testnet(_) => config_builder
                .testnet()
                .start_block_height(get_start_block_height(&opts)),
        }
        .build()
        .expect("Failed to build LakeConfig")
    }
}

// TODO: refactor to read from Redis once `storage` is extracted to a separate crate
fn get_start_block_height(opts: &Opts) -> u64 {
    match opts.start_options() {
        StartOptions::FromBlock { height } => *height,
        StartOptions::FromInterruption => match &std::fs::read("last_indexed_block") {
            Ok(contents) => String::from_utf8_lossy(contents).parse().unwrap(),
            Err(e) => {
                tracing::error!(
                    target: "alertexer",
                    "Cannot read last_indexed_block.\n{}\nStart indexer from genesis block",
                    e
                );
                0
            }
        },
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
