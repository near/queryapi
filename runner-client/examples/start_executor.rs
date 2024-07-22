use tonic::Request;

use runner::runner_client::RunnerClient;
use runner::StartExecutorRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = RunnerClient::connect("http://localhost:7001").await?;

    let response = client
        .start_executor(Request::new(StartExecutorRequest {
            account_id: "account_near".to_string(),
            function_name: "sample_indexer".to_string(),
            code: " 
                console.log('Hello, world!');
                await context.db.IndexerStorage.insert({
                    \"function_name\": \"sample_indexer\",
                    \"key_name\": block.blockHeight.toString(),
                    \"value\": \"Hello, world!\"
                });
            "
            .to_string(),
            schema: "CREATE TABLE \"indexer_storage\" (
                        \"function_name\" TEXT NOT NULL,
                        \"key_name\" TEXT NOT NULL,
                        \"value\" TEXT NOT NULL,
                        PRIMARY KEY (\"function_name\", \"key_name\")
                    );"
            .to_string(),
            redis_stream: "test:stream".to_string(),
            version: 123,
        }))
        .await?;

    println!("{:#?}", response.into_inner());

    Ok(())
}
