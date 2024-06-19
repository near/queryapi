fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("proto/runner.proto")?;
    tonic_build::compile_protos("proto/data-layer.proto")?;

    Ok(())
}
