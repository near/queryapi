#![cfg_attr(test, allow(dead_code))]

use anyhow::Context;
use std::collections::HashMap;

use near_jsonrpc_client::methods::query::RpcQueryRequest;
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::query::QueryResponseKind;
use near_primitives::types::{AccountId, BlockReference, Finality, FunctionArgs};
use near_primitives::views::QueryRequest;
use registry_types::AllIndexers;

use crate::indexer_config::IndexerConfig;
use crate::utils::exponential_retry;

pub type IndexerRegistry = HashMap<AccountId, HashMap<String, IndexerConfig>>;

#[cfg(test)]
pub use MockRegistryImpl as Registry;
#[cfg(not(test))]
pub use RegistryImpl as Registry;

pub struct RegistryImpl {
    json_rpc_client: JsonRpcClient,
    registry_contract_id: AccountId,
}

#[cfg_attr(test, mockall::automock)]
impl RegistryImpl {
    const LIST_METHOD: &str = "list_all";

    pub fn connect(registry_contract_id: AccountId, rpc_url: &str) -> Self {
        let json_rpc_client = JsonRpcClient::connect(rpc_url);

        Self {
            registry_contract_id,
            json_rpc_client,
        }
    }

    fn enrich_indexer_registry(
        &self,
        registry: HashMap<AccountId, HashMap<String, registry_types::IndexerConfig>>,
    ) -> IndexerRegistry {
        registry
            .into_iter()
            .map(|(account_id, indexers)| {
                let indexers = indexers
                    .into_iter()
                    .map(|(function_name, indexer)| {
                        (
                            function_name.to_owned(),
                            IndexerConfig {
                                account_id: account_id.clone(),
                                function_name,
                                code: indexer.code,
                                start_block: indexer.start_block,
                                schema: indexer.schema,
                                rule: indexer.rule,
                                updated_at_block_height: indexer.updated_at_block_height,
                                created_at_block_height: indexer.created_at_block_height,
                            },
                        )
                    })
                    .collect::<HashMap<_, _>>();

                (account_id, indexers)
            })
            .collect::<HashMap<_, _>>()
    }

    pub async fn fetch(&self) -> anyhow::Result<IndexerRegistry> {
        exponential_retry(|| async {
            let response = self
                .json_rpc_client
                .call(RpcQueryRequest {
                    block_reference: BlockReference::Finality(Finality::Final),
                    request: QueryRequest::CallFunction {
                        method_name: Self::LIST_METHOD.to_string(),
                        account_id: self.registry_contract_id.clone(),
                        args: FunctionArgs::from("{}".as_bytes().to_vec()),
                    },
                })
                .await
                .context("Failed to list registry contract")?;

            if let QueryResponseKind::CallResult(call_result) = response.kind {
                let all_indexers: AllIndexers = serde_json::from_slice(&call_result.result)?;

                return Ok(self.enrich_indexer_registry(all_indexers));
            }

            anyhow::bail!("Invalid registry response")
        })
        .await
    }
}
