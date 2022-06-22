use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct TxAlertRule {
    pub account_id: String,
}

/// Creates a Pool of PostgreSQL connections by the giving connection string
#[cfg(feature = "db")]
pub async fn connect(connection_str: &str) -> Result<sqlx::PgPool, sqlx::Error> {
    sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(connection_str)
        .await
}

#[derive(sqlx::FromRow, Clone, Debug)]
pub struct AlertRule {
    pub id: i32,
    pub name: String,
    pub chain_id: ChainId,
    pub alert_rule_kind: AlertRuleKind,
    pub is_paused: bool,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    matching_rule: sqlx::types::Json<MatchingRule>,
}

impl AlertRule {
    #[cfg(feature = "db")]
    pub async fn fetch_alert_rules(pool: &sqlx::PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(AlertRule,
            r#"
SELECT id, name, chain_id as "chain_id: _", alert_rule_kind as "alert_rule_kind: _", is_paused, updated_at, matching_rule as "matching_rule: sqlx::types::Json<MatchingRule>"
FROM alert_rules
            "#
        )
        .fetch_all(pool)
        .await
    }

    pub fn matching_rule(&self) -> MatchingRule {
        self.matching_rule.0.clone()
    }
}

#[derive(sqlx::Type, Clone, Debug)]
#[sqlx(type_name = "alert_rule_kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AlertRuleKind {
    Actions,
    Events,
}

#[derive(sqlx::Type, Clone, Debug)]
#[sqlx(type_name = "chain_id", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChainId {
    Mainnet,
    Testnet,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "rule", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MatchingRule {
    ActionAny {
        affected_account_id: String,
        status: Status,
    },
    ActionTransfer {
        affected_account_id: String,
        status: Status,
        amount: DepositAmountCondition,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Status {
    Any,
    Success,
    Fail,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind", content = "value", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DepositAmountCondition {
    Any,
    GreaterThan(u128),
    GreaterOrEqualThan(u128),
    LowerThan(u128),
    LowerOrEqualThan(u128),
    EqualExact(u128),
}
