use tracing_subscriber::EnvFilter;

pub(crate) fn init_tracing() {
    let mut env_filter = EnvFilter::new("near_lake_framework=info,alertexer=debug");

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

pub(crate) fn store_last_indexed_block_height(block_height: u64) -> anyhow::Result<u64> {
    std::fs::write("last_indexed_block", block_height.to_string().as_bytes())?;
    Ok(block_height)
}
