use near_jsonrpc_client::JsonRpcClient;

mod registry;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let json_rpc_client = JsonRpcClient::connect("https://rpc.mainnet.near.org");

    let registry = registry::fetch_registry(json_rpc_client).await?;
    eprintln!("registry = {:#?}", registry);

    Ok(())
}
