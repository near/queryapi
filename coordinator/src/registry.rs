use std::collections::HashMap;

use near_jsonrpc_client::methods::query::RpcQueryRequest;
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::query::QueryResponseKind;
use near_primitives::types::{AccountId, BlockReference, Finality, FunctionArgs};
use near_primitives::views::QueryRequest;
use registry_types::{AccountOrAllIndexers, IndexerRule};

pub type Registry = HashMap<AccountId, HashMap<String, IndexerConfig>>;

#[derive(Debug, Clone)]
pub struct IndexerConfig {
    pub account_id: AccountId,
    pub function_name: String,
    pub code: String,
    pub start_block_height: Option<u64>,
    pub schema: Option<String>,
    pub filter: IndexerRule,
}

fn enrich_registry(
    registry: HashMap<AccountId, HashMap<String, registry_types::IndexerConfig>>,
) -> Registry {
    registry
        .iter()
        .map(|(account_id, indexers)| {
            let indexers = indexers
                .iter()
                .map(|(function_name, indexer)| {
                    let indexer = indexer.clone();
                    (
                        function_name.clone(),
                        IndexerConfig {
                            account_id: account_id.clone(),
                            function_name: function_name.clone(),
                            code: indexer.code,
                            start_block_height: indexer.start_block_height,
                            schema: indexer.schema,
                            filter: indexer.filter,
                        },
                    )
                })
                .collect::<HashMap<_, _>>();

            (account_id.clone(), indexers)
        })
        .collect::<HashMap<_, _>>()
}

pub async fn fetch_registry(json_rpc_client: &JsonRpcClient) -> anyhow::Result<Registry> {
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
        let list_registry_response: AccountOrAllIndexers =
            serde_json::from_slice(&call_result.result)?;

        if let AccountOrAllIndexers::All(all_indexers) = list_registry_response {
            return Ok(enrich_registry(all_indexers));
        }
    }

    anyhow::bail!("Invalid registry response")
}
