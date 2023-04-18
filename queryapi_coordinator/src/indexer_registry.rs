use crate::AlertexerContext;
use alert_rules::{AlertRule, AlertRuleKind, MatchingRule, Status};
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

use crate::outcomes_reducer::indexer_reducer;
use crate::outcomes_reducer::indexer_reducer::FunctionCallInfo;
use shared::alertexer_types::indexer_types::{
    IndexerFunction, IndexerQueueMessage, IndexerRegistry,
};
use shared::{base64, Opts, Parser};

struct RegistryFunctionInvocation {
    pub account_id: AccountId,
    pub function_name: String,
}

fn build_indexer_function(
    function_config: &Value,
    function_name: String,
    account_id: String,
) -> IndexerFunction {
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
            let idx_fn = build_indexer_function(
                function_config,
                function_name.to_string(),
                account.to_string().parse().unwrap(),
            );
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

pub(crate) async fn index_registry_changes(
    block_height: BlockHeight,
    registry: &mut MutexGuard<'_, IndexerRegistry>,
    context: &AlertexerContext<'_>,
) -> Vec<JoinHandle<i64>> {
    let registry_method_name = "register_indexer_function";
    let registry_calls = build_registry_alert(registry_method_name);
    let registry_updates =
        indexer_reducer::reduce_function_registry_from_outcomes(&registry_calls, context);
    let mut spawned_start_from_block_threads = Vec::new();

    if registry_updates.len() > 0 {
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

                    match fns.get(new_indexer_function.function_name.as_str()) {
                        // if there is no existing function then we will insert the new one with the default state of provisioned = false
                        None => {
                            tracing::info!(
                                target: crate::INDEXER,
                                "indexed creation call to {registry_method_name}: {:?} {:?}",
                                new_indexer_function.account_id.clone(),
                                new_indexer_function.function_name.clone()
                            );
                        }

                        // if there is an existing function then respond to any changed fields
                        Some(old_indexer_function) => {
                            tracing::info!(
                                target: crate::INDEXER,
                                "indexed update call to {registry_method_name}: {:?} {:?}",
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
                            spawn_historical_message_thread(block_height, &mut new_indexer_function)
                        {
                            spawned_start_from_block_threads.push(thread);
                        }
                    }

                    fns.insert(update.method_name.clone(), new_indexer_function);
                }
            };
        }
    }

    let registry_method_name = "remove_indexer_function";
    let registry_calls = build_registry_alert(registry_method_name);
    let registry_updates =
        indexer_reducer::reduce_function_registry_from_outcomes(&registry_calls, context);
    if registry_updates.len() > 0 {
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
    spawned_start_from_block_threads
}

fn spawn_historical_message_thread(
    block_height: BlockHeight,
    new_indexer_function: &mut IndexerFunction,
) -> Option<JoinHandle<i64>> {
    new_indexer_function.start_block_height.map(|_| {
        let block_height_copy = block_height.clone();
        let new_indexer_function_copy = new_indexer_function.clone();
        tokio::spawn(async move {
            process_historical_messages(block_height_copy, new_indexer_function_copy).await
        })
    })
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
            Some(build_indexer_function(
                &args,
                args["function_name"].as_str().unwrap().to_string(),
                account_id,
            ))
        }
    }
}

fn parse_indexer_function_args(update: &FunctionCallInfo) -> Option<Value> {
    if let Ok(decoded_args) = base64::decode(&update.args) {
        if let Ok(mut args_json) = serde_json::from_slice(&decoded_args) {
            escape_json(&mut args_json);
            return Some(args_json);
        } else {
            tracing::error!(
                "Unable to json parse arguments to indexer function: {:?}",
                &update.method_name
            );
        }
    } else {
        tracing::error!(
            "Unable to base64 decode arguments to indexer function: {:?}",
            &update.method_name
        );
    }
    None
}

async fn process_historical_messages(
    block_height: BlockHeight,
    indexer_function: IndexerFunction,
) -> i64 {
    let start_block = indexer_function.start_block_height.unwrap();
    let block_difference: i64 = (block_height - start_block) as i64;
    match block_difference {
        i64::MIN..=-1 => {
            tracing::error!(target: crate::INDEXER, "Skipping back fill, start_block_height is greater than current block height: {:?} {:?}",
                                     indexer_function.account_id.clone(),
                                     indexer_function.function_name.clone(),);
        }
        0 => {
            tracing::info!(target: crate::INDEXER, "Skipping back fill, start_block_height is equal to current block height: {:?} {:?}",
                                     indexer_function.account_id.clone(),
                                     indexer_function.function_name.clone(),);
        }
        1..=3600 => {
            tracing::info!(
                target: crate::INDEXER,
                "Back filling {block_difference} blocks from {start_block} to current block height {block_height}: {:?} {:?}",
                indexer_function.account_id.clone(),
                indexer_function.function_name.clone(),
            );

            let opts = Opts::parse();

            let chain_id = opts.chain_id().clone();
            let aws_region = opts.aws_queue_region.clone();
            let queue_client = &opts.queue_client(aws_region);
            let queue_url = opts.start_from_block_queue_url.clone();

            // todo: fetch contract index files to get list of relevant blocks for our filter.

            for current_block in start_block..block_height {
                let msg = IndexerQueueMessage {
                    chain_id: chain_id.clone(), // alert_queue_message.chain_id.clone(),
                    alert_rule_id: 0,           // alert_queue_message.alert_rule_id,
                    alert_name: "Unfiltered Start Block Height".to_string(), //alert_queue_message.alert_name.clone(),
                    payload: None, //alert_queue_message.payload.clone(),
                    block_height: current_block,
                    indexer_function: indexer_function.clone(),
                };

                match shared::send_to_indexer_queue(queue_client, queue_url.clone(), vec![msg])
                    .await
                {
                    Ok(_) => {}
                    Err(err) => tracing::error!(
                        target: crate::INDEXER,
                        "#{} an error occurred during sending messages to the queue\n{:#?}",
                        block_height,
                        err
                    ),
                }
            }
        }
        3601..=i64::MAX => {
            tracing::error!(target: crate::INDEXER, "Skipping back fill, start_block_height is more than 1 hour before current block height: {:?} {:?}",
                                     indexer_function.account_id.clone(),
                                     indexer_function.function_name.clone(),);
        }
    }
    block_difference
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
    match read_only_call(
        rpc_client,
        crate::REGISTRY_CONTRACT,
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

fn escape_json(object: &mut Value) {
    match object {
        Value::Object(ref mut value) => {
            for (_key, val) in value {
                escape_json(val);
            }
        }
        Value::Array(ref mut values) => {
            for element in values.iter_mut() {
                escape_json(element)
            }
        }
        Value::String(ref mut value) => *value = value.escape_default().to_string(),
        _ => {}
    }
}

#[tokio::test]
async fn test_process_historical_messages() {
    let indexer_function = IndexerFunction {
        account_id: "buildnear.testnet".to_string().parse().unwrap(),
        function_name: "index_stuff".to_string(),
        code: "".to_string(),
        start_block_height: Some(85376002),
        schema: None,
        provisioned: false,
    };

    process_historical_messages(85376003, indexer_function).await;
}
