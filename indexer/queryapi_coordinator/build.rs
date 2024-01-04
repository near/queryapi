// TODO: Move to New Coordinator Folder
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // TODO: Update Runner Env deployment variables and docker compose file to contain RUNNER_PROTO_PATH
    let proto_path = std::env::var("RUNNER_PROTO_PATH")
        .unwrap_or_else(|_| "../../runner/protos/runner.proto".to_string());
    // TODO: Remove .ok() when we expect tonic build to succeed in deployment
    tonic_build::compile_protos(proto_path).ok();
    Ok(())
}
