fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("../../runner/protos/runner.proto")?;
    Ok(())
}