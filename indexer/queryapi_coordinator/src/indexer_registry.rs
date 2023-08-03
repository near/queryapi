use crate::QueryApiContext;
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::query::{QueryResponseKind, RpcQueryRequest};
use near_lake_framework::near_indexer_primitives::types::BlockReference::Finality;
use near_lake_framework::near_indexer_primitives::types::Finality::Final;
use near_lake_framework::near_indexer_primitives::types::{AccountId, BlockHeight, FunctionArgs};
use near_lake_framework::near_indexer_primitives::views::QueryRequest;
use serde_json::{json, Value};
use std::collections::hash_map::Entry;
use std::collections::HashMap;
use tokio::sync::MutexGuard;
use tokio::task::JoinHandle;
use unescape::unescape;

use crate::indexer_reducer;
use crate::indexer_reducer::FunctionCallInfo;
use crate::indexer_types::{IndexerFunction, IndexerRegistry};
use indexer_rule_type::indexer_rule::{IndexerRule, IndexerRuleKind, MatchingRule, Status};

pub(crate) fn registry_as_vec_of_indexer_functions(
    registry: &IndexerRegistry,
) -> Vec<IndexerFunction> {
    registry
        .values()
        .flat_map(|fns| fns.values())
        .cloned()
        .collect()
}

struct RegistryFunctionInvocation {
    pub account_id: AccountId,
    pub function_name: String,
}

fn build_indexer_function(
    function_config: &Value,
    function_name: String,
    account_id: String,
    indexer_rule: &IndexerRule,
) -> Option<IndexerFunction> {
    let code = function_config["code"].as_str();

    if let Some(c) = code {
        Some(IndexerFunction {
            account_id: account_id.parse().unwrap(),
            function_name,
            code: c.to_string(),
            start_block_height: function_config["start_block_height"].as_u64(),
            schema: function_config["schema"].as_str().map(String::from),
            provisioned: false,
            indexer_rule: indexer_rule.clone(),
        })
    } else {
        tracing::warn!(
            "No code found for account {} function {}",
            account_id,
            function_name
        );
        None
    }
}

pub(crate) fn build_registry_from_json(raw_registry: Value) -> IndexerRegistry {
    let mut registry: IndexerRegistry = HashMap::new();
    let raw_registry = raw_registry.as_object().unwrap();
    let raw_registry = raw_registry["All"].as_object().unwrap();

    for (account, functions) in raw_registry {
        let mut fns = HashMap::new();
        for (function_name, function_config) in functions.as_object().unwrap() {
            let indexer_rule = match serde_json::from_value(function_config["filter"].clone()) {
                Ok(indexer_rule) => indexer_rule,
                Err(e) => {
                    tracing::error!(
                        "Error parsing indexer_rule filter for account {} function {}: {}",
                        account,
                        function_name,
                        e
                    );
                    continue;
                }
            };

            let idx_fn = match build_indexer_function(
                function_config,
                function_name.to_string(),
                account.to_string().parse().unwrap(),
                &indexer_rule,
            ) {
                Some(idx_fn) => idx_fn,
                None => continue,
            };
            fns.insert(function_name.clone(), idx_fn);
        }
        registry.insert(account.parse().unwrap(), fns);
    }
    registry
}

/// Returns spawned start_from_block threads
pub(crate) async fn index_registry_changes(
    block_height: BlockHeight,
    registry: &mut MutexGuard<'_, IndexerRegistry>,
    context: &QueryApiContext<'_>,
) -> Vec<JoinHandle<i64>> {
    index_and_process_remove_calls(registry, context);

    index_and_process_register_calls(block_height, registry, context)
}

fn index_and_process_register_calls(
    block_height: BlockHeight,
    registry: &mut MutexGuard<IndexerRegistry>,
    context: &QueryApiContext,
) -> Vec<JoinHandle<i64>> {
    let registry_method_name = "register_indexer_function";
    let registry_calls_rule =
        build_registry_indexer_rule(registry_method_name, context.registry_contract_id);
    let registry_updates = indexer_reducer::reduce_function_registry_from_outcomes(
        &registry_calls_rule,
        &context.streamer_message,
        context.chain_id,
        context.streamer_message.block.header.height,
    );
    let mut spawned_start_from_block_threads = Vec::new();

    if !registry_updates.is_empty() {
        for update in registry_updates {
            let new_indexer_function = build_indexer_function_from_args(
                parse_indexer_function_args(&update),
                update.signer_id,
            );

            match new_indexer_function {
                None => continue,
                Some(mut new_indexer_function) => {
                    let fns = registry
                        .entry(new_indexer_function.account_id.clone())
                        .or_default();

                    let functions = fns.get(new_indexer_function.function_name.as_str());
                    match functions {
                        // if there is no existing function then we will insert the new one with the default state of provisioned = false
                        None => {
                            tracing::info!(
                                target: crate::INDEXER,
                                "Block {}. Indexed creation call to {registry_method_name}: {:?} {:?}",
                                block_height,
                                new_indexer_function.account_id.clone(),
                                new_indexer_function.function_name.clone()
                            );
                        }

                        // if there is an existing function then respond to any changed fields
                        Some(old_indexer_function) => {
                            tracing::info!(
                                target: crate::INDEXER,
                                "Block {}. Indexed update call to {registry_method_name}: {:?} {:?}",
                                block_height,
                                new_indexer_function.account_id.clone(),
                                new_indexer_function.function_name.clone(),
                            );

                            if old_indexer_function.schema == new_indexer_function.schema {
                                new_indexer_function.provisioned = true;
                            }
                        }
                    }

                    if new_indexer_function.start_block_height.is_some() {
                        if let Some(thread) =
                            crate::historical_block_processing::spawn_historical_message_thread(
                                block_height,
                                &mut new_indexer_function,
                            )
                        {
                            spawned_start_from_block_threads.push(thread);
                        }
                    }

                    fns.insert(update.method_name.clone(), new_indexer_function);
                }
            };
        }
    }
    spawned_start_from_block_threads
}

fn index_and_process_remove_calls(
    registry: &mut MutexGuard<IndexerRegistry>,
    context: &QueryApiContext,
) {
    let registry_method_name = "remove_indexer_function";
    let registry_calls_rule =
        build_registry_indexer_rule(registry_method_name, context.registry_contract_id);
    let registry_updates = indexer_reducer::reduce_function_registry_from_outcomes(
        &registry_calls_rule,
        &context.streamer_message,
        context.chain_id,
        context.streamer_message.block.header.height,
    );

    if !registry_updates.is_empty() {
        for update in registry_updates {
            let function_invocation: Option<RegistryFunctionInvocation> =
                build_function_invocation_from_args(
                    parse_indexer_function_args(&update),
                    update.signer_id,
                );
            match function_invocation {
                None => continue,
                Some(function_invocation) => {
                    tracing::info!(
                        target: crate::INDEXER,
                        "indexed removal call to {registry_method_name}: {:?} {:?}",
                        function_invocation.account_id.clone(),
                        function_invocation.function_name.clone(),
                    );
                    match registry.entry(function_invocation.account_id.clone()) {
                        Entry::Vacant(_) => {}
                        Entry::Occupied(mut fns) => {
                            fns.get_mut()
                                .remove(function_invocation.function_name.as_str());
                        }
                    }
                    // todo request removal of DB schema
                }
            }
        }
    }
}

fn build_function_invocation_from_args(
    args: Option<Value>,
    signer_id: String,
) -> Option<RegistryFunctionInvocation> {
    match args {
        None => None,
        Some(args) => {
            let account_id: String = match args["account_id"] {
                Value::String(ref account_id) => account_id.clone(),
                _ => signer_id,
            };
            Some(RegistryFunctionInvocation {
                account_id: account_id.parse().unwrap(),
                function_name: args["function_name"].as_str().unwrap().to_string(),
            })
        }
    }
}

fn build_indexer_function_from_args(
    args: Option<Value>,
    signer_id: String,
) -> Option<IndexerFunction> {
    match args {
        None => None,
        Some(args) => {
            let account_id: String = match args["account_id"] {
                Value::String(ref account_id) => account_id.clone(),
                _ => signer_id,
            };
            let function_name = args["function_name"].as_str();
            match function_name {
                None => {
                    tracing::warn!(
                        "Unable to parse function_name from indexer function: {:?}",
                        &args
                    );
                    None
                }
                Some(function_name) => match unescape(&args["filter_json"].to_string()) {
                    Some(filter_string) => {
                        let filter_json_strip_quotes = &filter_string[1..filter_string.len() - 1];
                        match serde_json::from_str(filter_json_strip_quotes) {
                            Ok(filter_json) => match serde_json::from_value(filter_json) {
                                Ok(indexer_rule) => build_indexer_function(
                                    &args,
                                    function_name.to_string(),
                                    account_id,
                                    &indexer_rule,
                                ),
                                Err(e) => {
                                    tracing::warn!("Error parsing filter into indexer_rule for account {} function {}: {}, {}", account_id, function_name, e, filter_string);
                                    None
                                }
                            },
                            Err(e) => {
                                tracing::warn!("Error parsing indexer_rule filter for account {} function {}: {}, {}", account_id, function_name, e, filter_string);
                                None
                            }
                        }
                    }
                    None => {
                        tracing::warn!(
                            "Unable to unescape filter_json from registration args: {:?}",
                            &args
                        );
                        None
                    }
                },
            }
        }
    }
}

fn parse_indexer_function_args(update: &FunctionCallInfo) -> Option<Value> {
    if let Ok(args_json) = serde_json::from_str(&update.args) {
        return Some(args_json);
    } else {
        tracing::error!(
            "Unable to json parse arguments to indexer function: {:?}",
            &update.method_name
        );
    }
    None
}

fn build_registry_indexer_rule(
    registry_method_name: &str,
    registry_contract_id: &str,
) -> IndexerRule {
    let matching_rule = MatchingRule::ActionFunctionCall {
        affected_account_id: registry_contract_id.to_string(),
        function: registry_method_name.to_string(),
        status: Status::Success,
    };
    IndexerRule {
        id: None,
        name: Some(format!("{}{}", registry_method_name, "_changes")),
        indexer_rule_kind: IndexerRuleKind::Action,
        matching_rule,
    }
}

pub async fn read_indexer_functions_from_registry(
    rpc_client: &JsonRpcClient,
    registry_contract_id: &str,
) -> Value {
    match read_only_call(
        rpc_client,
        registry_contract_id,
        "list_indexer_functions",
        FunctionArgs::from(json!({}).to_string().into_bytes()),
    )
    .await
    {
        Ok(functions) => functions,
        Err(err) => {
            panic!("Unable to read indexer functions from registry: {:?}", err);
        }
    }
}

async fn read_only_call(
    client: &JsonRpcClient,
    contract_name: &str,
    function_name: &str,
    args: FunctionArgs,
) -> Result<Value, anyhow::Error> {
    let account_id: AccountId = contract_name.parse()?;

    let request = RpcQueryRequest {
        block_reference: Finality(Final),
        request: QueryRequest::CallFunction {
            account_id,
            method_name: function_name.to_string(),
            args,
        },
    };

    let response = client.call(request).await?;

    if let QueryResponseKind::CallResult(result) = response.kind {
        return Ok(serde_json::from_str(std::str::from_utf8(&result.result).unwrap()).unwrap());
    }
    Err(anyhow::anyhow!("Unable to make rpc call: {:?}", response))
}
