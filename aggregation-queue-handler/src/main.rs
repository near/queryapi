use alertexer_types::primitives::AlertDeliveryTask;
use aws_lambda_events::event::sqs::{SqsEvent, SqsMessage};
use borsh::BorshDeserialize;
use lambda_runtime::{run, service_fn, Error, LambdaEvent};

use near_jsonrpc_client::errors::{
    JsonRpcError::ServerError, JsonRpcServerError::ResponseStatusError,
    JsonRpcServerResponseStatusError::Unauthorized,
};
use near_jsonrpc_client::{methods, JsonRpcClient};
use near_jsonrpc_primitives::types::transactions::TransactionInfo;
use near_jsonrpc_primitives::types::query::QueryResponseKind;
use near_primitives::types::{AccountId, BlockReference, Finality, FunctionArgs};
use near_primitives::views::QueryRequest;
use near_primitives::transaction::{Action, FunctionCallAction, Transaction};
use serde_json::{json};


static POOL: tokio::sync::OnceCell<sqlx::PgPool> = tokio::sync::OnceCell::const_new();

#[derive(thiserror::Error, Debug)]
pub enum QueueError {
    #[error("lambda_runtime error")]
    LambdaError(#[from] Error),
    #[error("Handle message error")]
    HandleMessage(String),
    #[error("Decode error")]
    DecodeError(#[from] base64::DecodeError),
    #[error("IO Error")]
    IOError(#[from] std::io::Error),
    #[error("Serialization error")]
    SerializationError(#[from] serde_json::Error),
    #[error("Request Error")]
    RequestError(#[from] minreq::Error),
    #[error("SQLx Error")]
    SqlxError(#[from] sqlx::Error),
}


/// Handle Lambda invocation (new SQS message)
async fn function_handler(event: LambdaEvent<SqsEvent>) -> Result<Vec<()>, QueueError> {
    let pool = POOL
        .get_or_init(|| async {
            match connect(
                &std::env::var("DATABASE_URL").expect(
                    "A DATABASE_URL must be set in this app's Lambda environment variables.",
                ),
            )
            .await
            {
                Ok(res) => res,
                Err(err) => {
                    tracing::error!("Failed to establish DB connection:\n{:?}", err);
                    panic!("{:?}", err);
                }
            }
        })
        .await;

    let handle_message_futures = event
        .payload
        .records
        .into_iter()
        .map(|sqs_message| handle_message(sqs_message, &pool));

    futures::future::try_join_all(handle_message_futures).await
}

async fn handle_message(message: SqsMessage, pool: &sqlx::PgPool) -> Result<(), QueueError> {
    if let Some(endoded_message) = message.body {
        let decoded_message = match base64::decode(endoded_message) {
            Ok(res) => res,
            Err(err) => {
                tracing::error!(
                    "Error during decoding the base64 body of the AlertQueueMessage\n{:?}",
                    err
                );
                panic!("{:?}", err);
            }
        };
        let delivery_task = match AlertDeliveryTask::try_from_slice(&decoded_message) {
            Ok(res) => {
                tracing::info!("{:?}", res);
                res
            }
            Err(err) => {
                tracing::error!("Failed to BorshDeserialize AlertDeliveryTask:\n{:?}", err);
                panic!("{:?}", err);
            }
        };

        // println!("decoded_message: {:?}", decoded_message);
        if let alertexer_types::primitives::DestinationConfig::Aggregation {
            contract_name,
            function_name,
            destination_id,
        } = delivery_task.destination_config
        {
            println!("\nAggregation received with contract_name: {} and function_name: {}\n", contract_name, function_name);
            let status = 200;
            let response = "test response";
            let call_result = match write_call(&contract_name, &function_name).await {
                Ok(res) => {
                    println!("RPC call complete");
                    res
                },
                Err(err) => {
                    println!("Failed to call RPC:\n{:?}", err);
                }
            };

            {

                // local test messages have the same IDs and cause errors with inserts
                // let _res = sqlx::query!(
                //     "INSERT INTO triggered_alerts_destinations (triggered_alert_id, alert_id, destination_id, status, response, created_at) VALUES ($1, $2, $3, $4, $5, now())",
                //     delivery_task.triggered_alert_id,
                //     delivery_task.alert_message.alert_rule_id,
                //     destination_id,
                //     status,
                //     response,
                // )
                //     .execute(pool)
                //     .await;
                // if _res.is_err() {
                //     tracing::error!(
                //         "[Skip] Error on inserting triggered_alerts_destination info to the DB:\n{:?}",
                //         _res
                //     );
                // }
            }
            return Ok(());
        }
    }
    Err(QueueError::HandleMessage(
        "SQS message is empty".to_string(),
    ))
}

async fn write_call(contract_name: &str, function_name: &str) -> Result<(), Box<dyn std::error::Error>> {
//    let client = JsonRpcClient::connect("https://near-testnet.api.pagoda.co/rpc/v1/");
    let client = JsonRpcClient::connect("https://rpc.testnet.near.org");

    let account_id: AccountId = contract_name.parse()?;

    let signer_account_id = &std::env::var("INVOKING_ACCOUNT_ID").expect(
        "An INVOKING_ACCOUNT_ID must be set in this app's Lambda environment variables.",
    );
    let signer_secret_key = &std::env::var("INVOKING_PRIVATE_KEY").expect(
        "An INVOKING_PRIVATE_KEY must be set in this app's Lambda environment variables.",
    );

    let signer = near_crypto::InMemorySigner::from_secret_key(signer_account_id.parse()?, signer_secret_key.parse()?);

    let access_key_query_response = client
        .call(methods::query::RpcQueryRequest {
            block_reference: BlockReference::latest(),
            request: near_primitives::views::QueryRequest::ViewAccessKey {
                account_id: signer.account_id.clone(),
                public_key: signer.public_key.clone(),
            },
        })
        .await?;

    let current_nonce = match access_key_query_response.kind {
        QueryResponseKind::AccessKey(access_key) => access_key.nonce,
        _ => Err("failed to extract current nonce")?,
    };

    let transaction = Transaction {
        signer_id: signer.account_id.clone(),
        public_key: signer.public_key.clone(),
        nonce: current_nonce + 1,
        receiver_id: account_id,
        block_hash: access_key_query_response.block_hash,
        actions: vec![Action::FunctionCall(FunctionCallAction {
            method_name: function_name.to_string(),
            args: json!({
                // ideally the parameter name would be a standard part of the interface
                // ideally the data would be pulled from the SQS message
                // or the Streamer message fetched from S3
                // currently the Streamer Message is not put on SQS
                "function_calls_to_set_greeting": ["Hardcoded demo data"],
            })
                .to_string()
                .into_bytes(),
            gas: 100_000_000_000_000, // 100 TeraGas
            deposit: 0,
        })],
    };

    let request = methods::broadcast_tx_commit::RpcBroadcastTxCommitRequest {
        signed_transaction: transaction.sign(&signer),
    };

    let response = client.call(request).await?;

    println!("response: {:#?}", response);

    Ok(())
}

async fn read_only_call(contract_name: &str, function_name: &str) -> Result<(), Box<dyn std::error::Error>> {
//    let client = JsonRpcClient::connect("https://near-testnet.api.pagoda.co/rpc/v1/");
    let client = JsonRpcClient::connect("https://rpc.testnet.near.org");

    let account_id: AccountId = contract_name.parse()?;

    let request = methods::query::RpcQueryRequest {
        block_reference: BlockReference::Finality(Finality::Final),
        request: QueryRequest::CallFunction {
            account_id: account_id,
            method_name: function_name.to_string(),
            args: FunctionArgs::from(
                json!({
                    "account_id": "foo".to_string(),
                })
                    .to_string()
                    .into_bytes(),
            ),
        },
    };

    let response = client.call(request).await?;

    if let QueryResponseKind::CallResult(result) = response.kind {
        println!("{:?}", std::str::from_utf8(&result.result).unwrap());
    }

    Ok(())
}
async fn view_account_rpc() -> Result<(), Box<dyn std::error::Error>> {
//    let client = JsonRpcClient::connect("https://near-testnet.api.pagoda.co/rpc/v1/");
    let client = JsonRpcClient::connect("https://rpc.testnet.near.org");

    let account_id: AccountId = "aggregations.buildnear.testnet".parse()?;

    let request = methods::query::RpcQueryRequest {
        block_reference: BlockReference::Finality(Finality::Final),
        request: QueryRequest::ViewAccount { account_id },
    };

    let response = client.call(request).await?;

    if let QueryResponseKind::ViewAccount(result) = response.kind {
        println!("{:#?}", result);
    }


    Ok(())
}

async fn connect(connection_str: &str) -> Result<sqlx::PgPool, sqlx::Error> {
    sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(connection_str)
        .await
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        // disabling time is handy because CloudWatch will add the ingestion time.
        .without_time()
        .init();

    run(service_fn(function_handler)).await
}
