use reqwest::Client;
use serde_json::{json, Value};
use tokio;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let token = "";
    let hostname = "4221960800361869.9.gcp.databricks.com";
    let http_path = "/sql/1.0/warehouses/1958603dd60ca0b0";
    let sql_query = "SELECT 
    eo.block_date,
    collect_set(eo.block_height) as block_heights
FROM hive_metastore.mainnet.silver_execution_outcomes eo
JOIN hive_metastore.mainnet.silver_action_receipt_actions ara ON ara.receipt_id = eo.receipt_id
WHERE eo.block_height >= 112639733 AND eo.block_height <= 113639733
AND (ara.receipt_receiver_account_id LIKE 'social.near')
GROUP BY eo.block_date
ORDER BY eo.block_date";

    let url = format!("https://{}/sql/1.0/warehouses/1958603dd60ca0b0", hostname);
    let body = json!({
        "query": sql_query,
        "data_source": {
            "id": http_path
        }
    });

    let res = client.post(url)
        .bearer_auth(token)
        .body(serde_json::to_string(&body).unwrap())
        .send()
        .await?;

    println!("Response: {:?}", res.text().await?);
    Ok(())
}