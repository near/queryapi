// TODO: Move to New Coordinator Folder
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // TODO: Update Runner Env deployment variables to include RUNNER_PROTO_PATH
    // TODO: Update build trigger to build docker using ./ context instead of ./indexer build context
    let proto_path = std::env::var("RUNNER_PROTO_PATH")
        .unwrap_or_else(|_| "../../runner/protos/runner.proto".to_string());
    tonic_build::compile_protos(proto_path)?;
    Ok(())
}
