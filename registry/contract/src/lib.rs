use near_sdk::collections::UnorderedMap;

// Find all our documentation at https://docs.near.org
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, log, near_bindgen, BorshStorageKey};

type FunctionName = String;

/// Helper structure to for keys of the persistent collections.
#[derive(BorshStorageKey, BorshSerialize)]
pub enum StorageKey {
    IndexerFunctions,
}

// Define the contract structure
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct Contract {
    registry: UnorderedMap<FunctionName, IndexerConfig>,
}

// Define the contract structure
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct IndexerConfig {
    code: String,
    start_block_height: Option<u64>,
    schema: Option<String>,
}

// Define the default, which automatically initializes the contract
impl Default for Contract {
    fn default() -> Self {
        Self {
            registry: UnorderedMap::new(StorageKey::IndexerFunctions),
        }
    }
}

// Implement the contract structure
#[near_bindgen]
impl Contract {
    // Public method - returns a function previously registered under this name or empty string
    pub fn read_indexer_function(&self, function_name: String) -> IndexerConfig {
        match self.registry.get(&function_name) {
            Some(config) => config,
            None => env::panic_str(
                format!("The function_name {} is not registered", &function_name).as_str(),
            ),
        }
    }

    // Public method - registers indexer code under <account_id>/function_name
    pub fn register_indexer_function(
        &mut self,
        function_name: String,
        code: String,
        start_block_height: Option<u64>,
        schema: Option<String>,
    ) {
        let signer_account_id = env::signer_account_id().as_str().to_string();
        let registered_name = [signer_account_id, function_name].join("/");
        let config = IndexerConfig {
            code,
            start_block_height,
            schema,
        };
        log!(
            "Registering function with account and function_name {}",
            &registered_name
        );
        self.registry.insert(&registered_name, &config);
    }

    pub fn remove_indexer_function(&mut self, function_name: String) {
        let signer_account_id = env::signer_account_id().as_str().to_string();
        let registered_name = [signer_account_id, function_name].join("/");
        log!(
            "Removing function with account and function_name {}",
            &registered_name
        );
        self.registry.remove(&registered_name);
    }

    pub fn list_indexer_functions(&self) -> &UnorderedMap<FunctionName, IndexerConfig> {
        &self.registry
    }
}

/*
 * The rest of this file holds the inline tests for the code above
 * Learn more about Rust tests: https://doc.rust-lang.org/book/ch11-01-writing-tests.html
 */
#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    #[test]
    #[should_panic(expected = "The function_name developer.near/test is not registered")]
    fn get_empty() {
        let contract = Contract::default();
        // no registered indexers so should return the default ""
        contract.read_indexer_function("developer.near/test".to_string());
    }

    #[test]
    fn set_then_get_indexer_function() {
        let mut contract = Contract::default();
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
        };
        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height.clone(),
            config.schema.clone(),
        );
        assert_eq!(
            // default account is bob.near
            contract.read_indexer_function("bob.near/test".to_string()),
            config
        );
    }

    #[test]
    #[should_panic(expected = "The function_name bob.near/test is not registered")]
    fn set_then_get_then_remove_indexer_function() {
        let mut contract = Contract::default();
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
        };
        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height.clone(),
            config.schema.clone(),
        );
        assert_eq!(
            // default account is bob.near
            contract.read_indexer_function("bob.near/test".to_string()),
            config
        );
        contract.remove_indexer_function("test".to_string());
        let empty_config = IndexerConfig {
            code: "".to_string(),
            start_block_height: None,
            schema: None,
        };
        assert_eq!(
            contract.read_indexer_function("bob.near/test".to_string()),
            empty_config
        );
    }

    #[test]
    fn set_then_list_indexer_functions() {
        let mut contract = Contract::default();
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(4343333),
            schema: Some("key: string, value: string".to_string()),
        };
        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height.clone(),
            config.schema.clone(),
        );
        let mut expected = UnorderedMap::new(b"r".to_vec());
        expected.insert(&"bob.near/test".to_string(), &config);
        let actual: HashMap<String, IndexerConfig> =
            contract.list_indexer_functions().iter().collect();
            
        assert_eq!(actual, expected.iter().collect());
    }
}
