#![cfg_attr(test, allow(dead_code))]

use anyhow::Context;
use std::collections::hash_map::Iter;
use std::collections::HashMap;

use near_jsonrpc_client::methods::query::RpcQueryRequest;
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::query::QueryResponseKind;
use near_primitives::types::{AccountId, BlockReference, Finality, FunctionArgs};
use near_primitives::views::QueryRequest;
use registry_types::AllIndexers;

use crate::indexer_config::IndexerConfig;
use crate::utils::exponential_retry;

pub struct IndexerRegistry(pub HashMap<AccountId, HashMap<String, IndexerConfig>>);

impl IndexerRegistry {
    #[cfg(test)]
    pub fn from(slice: &[(AccountId, HashMap<String, IndexerConfig>)]) -> Self {
        Self(slice.iter().cloned().collect())
    }

    pub fn iter(&self) -> IndexerRegistryIter {
        IndexerRegistryIter {
            account_iter: self.0.iter(),
            function_iter: None,
        }
    }
}

pub struct IndexerRegistryIter<'a> {
    account_iter: Iter<'a, AccountId, HashMap<String, IndexerConfig>>,
    function_iter: Option<Iter<'a, String, IndexerConfig>>,
}

impl<'a> Iterator for IndexerRegistryIter<'a> {
    type Item = &'a IndexerConfig;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if let Some(ref mut function_iter) = self.function_iter {
                if let Some((_function_name, indexer_config)) = function_iter.next() {
                    return Some(indexer_config);
                }
            }

            match self.account_iter.next() {
                Some((_account_id, function_iter)) => {
                    self.function_iter = Some(function_iter.iter())
                }
                None => return None,
            }
        }
    }
}

impl std::ops::Deref for IndexerRegistry {
    type Target = HashMap<AccountId, HashMap<String, IndexerConfig>>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

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
    const LIST_METHOD: &'static str = "list_all";

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
        IndexerRegistry(
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
                .collect::<HashMap<_, _>>(),
        )
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
