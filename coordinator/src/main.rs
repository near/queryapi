use near_jsonrpc_client::methods::query::RpcQueryRequest;
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::query::QueryResponseKind;
use near_primitives::types::{BlockReference, Finality, FunctionArgs};
use near_primitives::views::QueryRequest;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let json_rpc_client = JsonRpcClient::connect("https://rpc.mainnet.near.org");

    let response = json_rpc_client
        .call(RpcQueryRequest {
            block_reference: BlockReference::Finality(Finality::Final),
            request: QueryRequest::CallFunction {
                method_name: "list_indexer_functions".to_string(),
                account_id: "queryapi.dataplatform.near".to_string().try_into().unwrap(),
                args: FunctionArgs::from("{}".as_bytes().to_vec()),
            },
        })
        .await?;

    if let QueryResponseKind::CallResult(call_result) = response.kind {
        let registry: serde_json::Value = serde_json::from_slice(&call_result.result)?;
        eprintln!("registry = {:#?}", registry);
    }

    Ok(())
}
