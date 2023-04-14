use std::collections::hash_map::Entry;
use std::collections::HashMap;
use near_jsonrpc_client::JsonRpcClient;
use near_jsonrpc_primitives::types::query::{QueryResponseKind, RpcQueryRequest};
use near_lake_framework::near_indexer_primitives::types::{AccountId, FunctionArgs};
use near_lake_framework::near_indexer_primitives::types::BlockReference::Finality;
use near_lake_framework::near_indexer_primitives::types::Finality::Final;
use near_lake_framework::near_indexer_primitives::views::QueryRequest;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::MutexGuard;
use alert_rules::{AlertRule, AlertRuleKind, MatchingRule, Status};
use storage::ConnectionManager;
use crate::{AlertexerContext};

use shared::alertexer_types::ChainId;
use shared::alertexer_types::indexer_types::{IndexerFunction, IndexerRegistry};
use shared::alertexer_types::primitives::AlertQueueMessagePayload;
use shared::base64;
use crate::outcomes_reducer::indexer_reducer;
use crate::outcomes_reducer::indexer_reducer::FunctionCallInfo;

struct RegistryFunctionInvocation {
    pub account_id: AccountId,
    pub function_name: String,
}

fn build_indexer_function(function_config: &Value, function_name: String, account_id: String) -> IndexerFunction {
    IndexerFunction {
        account_id: account_id.parse().unwrap(),
        function_name,
        code: function_config["code"].as_str().unwrap().to_string(),
        start_block_height: function_config["start_block_height"].as_u64(),
        schema: function_config["schema"].as_str().map(String::from),
        provisioned: false,
    }
}

pub(crate) fn build_registry_from_json(raw_registry: Value) -> IndexerRegistry {
    let mut registry: IndexerRegistry = HashMap::new();
    let raw_registry = raw_registry.as_object().unwrap();
    let raw_registry = raw_registry["All"].as_object().unwrap();

    for (account, functions) in raw_registry {
        let mut fns = HashMap::new();
        for (function_name, function_config) in functions.as_object().unwrap() {
            let idx_fn = build_indexer_function(function_config, function_name.to_string(), account.to_string().parse().unwrap());
            // future feature
            // alert_rule: AlertRule {
            //     kind: AlertRuleKind::from_str(function_config["alertRule"]["kind"].as_str()),
            //     matching_rule: MatchingRule::from_str(function_config["alertRule"]["matchingRule"].as_str()),
            //     status: Status::from_str(function_config["alertRule"]["status"].as_str()),
            //     value: function_config["alertRule"]["value"].as_u64(),
            // }
            fns.insert(function_name.clone(), idx_fn);
        }
        registry.insert(account.parse().unwrap(), fns);
    }
    registry
}

pub(crate) async fn index_registry_changes(registry: &mut MutexGuard<'_, IndexerRegistry>, context: &AlertexerContext<'_>) {
    let registry_method_name = "register_indexer_function";
    let registry_calls = build_registry_alert(registry_method_name);
    let registry_updates = indexer_reducer::reduce_function_registry_from_outcomes(&registry_calls, context);
    if registry_updates.len() > 0 {
        for update in registry_updates {

            let mut new_indexer_function = build_indexer_function_from_args(
                parse_indexer_function_args(&update), update.signer_id);

            match new_indexer_function {
                None => continue,
                Some(mut new_indexer_function) => {
                    let fns = registry.entry(new_indexer_function.account_id.clone()).or_default();

                    match fns.get(new_indexer_function.function_name.as_str()) {
                        None => {
                            tracing::info!(target: crate::INDEXER, "indexed creation call to {registry_method_name}: {:?} {:?}",
                                     new_indexer_function.account_id.clone(),
                                     new_indexer_function.function_name.clone()
                            );
                            fns.insert(update.method_name.clone(), new_indexer_function);
                        }
                        Some(old_indexer_function) => {
                            // if there is an old function then respond to any changed fields
                            if old_indexer_function.start_block_height != new_indexer_function.start_block_height {
                                // todo spawn historical indexer thread
                            }
                            if old_indexer_function.schema == new_indexer_function.schema {
                                new_indexer_function.provisioned = true;
                            }
                            tracing::info!(target: crate::INDEXER, "indexed update call to {registry_method_name}: {:?} {:?}",
                                     new_indexer_function.account_id.clone(),
                                     new_indexer_function.function_name.clone(),
                            );
                            fns.insert(update.method_name.clone(), new_indexer_function);
                        }
                    }
                }
            };
        }
    }

    let registry_method_name = "remove_indexer_function";
    let registry_calls = build_registry_alert(registry_method_name);
    let registry_updates = indexer_reducer::reduce_function_registry_from_outcomes(&registry_calls, context);
    if registry_updates.len() > 0 {
        for update in registry_updates {

            let function_invocation: Option<RegistryFunctionInvocation> = build_function_invocation_from_args(
                parse_indexer_function_args(&update), update.signer_id);
            match function_invocation {
                None => continue,
                Some(function_invocation) => {
                    tracing::info!(target: crate::INDEXER, "indexed removal call to {registry_method_name}: {:?} {:?}",
                                     function_invocation.account_id.clone(),
                                     function_invocation.function_name.clone(),
                        );
                    match registry.entry(function_invocation.account_id.clone()) {
                        Entry::Vacant(_) => {},
                        Entry::Occupied(mut fns) => {
                            fns.get_mut().remove(function_invocation.function_name.as_str());
                        }
                    }
                    // todo request removal of DB schema
                }
            }
        }
    }
}

fn build_function_invocation_from_args(args: Option<Value>, signer_id: String) -> Option<RegistryFunctionInvocation> {
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

fn build_indexer_function_from_args(args: Option<Value>, signer_id: String) -> Option<IndexerFunction> {
    match args {
        None => None,
        Some(args) => {
            let account_id: String = match args["account_id"] {
                Value::String(ref account_id) => account_id.clone(),
                _ => signer_id,
            };
            Some(build_indexer_function(&args, args["function_name"].as_str().unwrap().to_string(), account_id))
        }
    }
}

fn parse_indexer_function_args(update: &FunctionCallInfo) -> Option<Value> {
    if let Ok(decoded_args) = base64::decode(&update.args) {
        if let Ok(mut args_json) = serde_json::from_slice(&decoded_args) {
            escape_json(&mut args_json);
            return Some(args_json);
        } else {
            tracing::error!("Unable to json parse arguments to indexer function: {:?}", &update.method_name);
        }
    } else {
        tracing::error!("Unable to base64 decode arguments to indexer function: {:?}", &update.method_name);
    }
    None
}

pub(crate) async fn fetch_indexer_functions(rpc_client: &JsonRpcClient,
                                            redis_connection_manager: &ConnectionManager) -> Value {
    match storage::get::<Option<String>>(
        redis_connection_manager,
        "indexer_function_registry",
    ).await {
        Ok(Some(indexer_functions)) => {
            let indexer_functions: Value = serde_json::from_str(&indexer_functions).unwrap();
            indexer_functions
        },
        Ok(None) => {
            read_indexer_functions_from_registry(rpc_client).await
        }
        Err(err) => {
            panic!("Unable to read indexer functions from redis: {:?}", err);
        }
    }
}

fn build_registry_alert(registry_method_name: &str) -> AlertRule {
    let matching_rule = MatchingRule::ActionFunctionCall {
        affected_account_id: crate::REGISTRY_CONTRACT.to_string(),
        function: registry_method_name.to_string(),
        status: Status::Any,
    };
    let registry_calls = AlertRule {
        id: 0,
        name: format!("{}{}", registry_method_name, "_changes"),
        chain_id: alert_rules::ChainId::Mainnet,
        alert_rule_kind: AlertRuleKind::Actions,
        is_paused: false,
        updated_at: None,
        matching_rule,
    };
    registry_calls
}

pub async fn read_indexer_functions_from_registry(rpc_client: &JsonRpcClient) -> Value {
    match read_only_call(rpc_client,
                         crate::REGISTRY_CONTRACT,
                         "list_indexer_functions",
                         FunctionArgs::from(json!({}).to_string().into_bytes())).await {
        Ok(functions) => {
            functions
        },
        Err(err) => {
            panic!("Unable to read indexer functions from registry: {:?}", err);
        }
    }
}

async fn read_only_call(client: &JsonRpcClient, contract_name: &str, function_name: &str, args: FunctionArgs) -> Result<Value, anyhow::Error> {

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

fn escape_json(object: &mut serde_json::Value) {
    match object {
        serde_json::Value::Object(ref mut value) => {
            for (_key, val) in value {
                escape_json(val);
            }
        }
        serde_json::Value::Array(ref mut values) => {
            for element in values.iter_mut() {
                escape_json(element)
            }
        }
        serde_json::Value::String(ref mut value) => *value = value.escape_default().to_string(),
        _ => {}
    }
}