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

#[derive(Clone)]
pub struct IndexerRegistry(pub HashMap<AccountId, HashMap<String, IndexerConfig>>);

impl IndexerRegistry {
    #[cfg(test)]
    pub fn from(slice: &[(AccountId, HashMap<String, IndexerConfig>)]) -> Self {
        Self(slice.iter().cloned().collect())
    }

    #[cfg(test)]
    pub fn new() -> Self {
        Self(HashMap::new())
    }

    pub fn iter(&self) -> IndexerRegistryIter {
        IndexerRegistryIter {
            account_iter: self.0.iter(),
            function_iter: None,
        }
    }

    #[cfg(test)]
    pub fn get(&self, account_id: &AccountId, function_name: &str) -> Option<&IndexerConfig> {
        self.0.get(account_id)?.get(function_name)
    }

    pub fn remove(&mut self, account_id: &AccountId, function_name: &str) -> Option<IndexerConfig> {
        self.0.get_mut(account_id)?.remove(function_name)
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

impl std::ops::DerefMut for IndexerRegistry {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
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
    const GET_METHOD: &'static str = "read_indexer_function";

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
                                    deleted_at_block_height: indexer.deleted_at_block_height,
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

    pub async fn fetch_indexer(
        &self,
        account_id: &AccountId,
        function_name: &str,
    ) -> anyhow::Result<Option<IndexerConfig>> {
        let response = self
            .json_rpc_client
            .call(RpcQueryRequest {
                block_reference: BlockReference::Finality(Finality::Final),
                request: QueryRequest::CallFunction {
                    method_name: Self::GET_METHOD.to_string(),
                    account_id: self.registry_contract_id.clone(),
                    args: FunctionArgs::from(
                        serde_json::json!({
                            "account_id": account_id,
                            "function_name": function_name,
                        })
                        .to_string()
                        .as_bytes()
                        .to_vec(),
                    ),
                },
            })
            .await
            .context("Failed to fetch indexer")?;

        if let QueryResponseKind::CallResult(call_result) = response.kind {
            if call_result.result.is_empty() {
                return Ok(None);
            }

            let config: registry_types::IndexerConfig =
                serde_json::from_slice::<registry_types::IndexerConfig>(&call_result.result)
                    .context("Failed to deserialize config from JSON provided by RPC call")?;
            let indexer = IndexerConfig {
                account_id: account_id.clone(),
                function_name: function_name.to_string(),
                code: config.code,
                schema: config.schema,
                rule: config.rule,
                start_block: config.start_block,
                updated_at_block_height: config.updated_at_block_height,
                created_at_block_height: config.created_at_block_height,
                deleted_at_block_height: config.deleted_at_block_height,
            };

            return Ok(Some(indexer));
        }

        anyhow::bail!("Invalid registry response")
    }
}
