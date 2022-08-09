#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Event {
    pub event: String,
    pub standard: String,
    pub version: String,
    pub data: Option<serde_json::Value>,
}

impl Event {
    pub fn from_log(log: &str) -> anyhow::Result<Self> {
        let prefix = "EVENT_JSON:";
        if !log.starts_with(prefix) {
            anyhow::bail!("log message doesn't start from required prefix");
        }

        Ok(serde_json::from_str::<'_, Self>(
            log[prefix.len()..].trim(),
        )?)
    }
}
