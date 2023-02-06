// Find all our documentation at https://docs.near.org
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{near_bindgen, env, log};

use std::collections::HashMap;

// Define the contract structure
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct Contract {
    registry: HashMap<String, String>,
}

// Define the default, which automatically initializes the contract
impl Default for Contract{
    fn default() -> Self{
        Self{registry: HashMap::new()}
    }
}

// Implement the contract structure
#[near_bindgen]
impl Contract {
    // Public method - returns a function previously registered under this name or empty string
    pub fn read_indexer_function(&self, name: String) -> String {
        return self.registry.get(&name).unwrap_or(&"".to_string()).to_string();
    }

    // Public method - registers indexer code under <account_id>/name
    pub fn register_indexer_function(&mut self, name: String, code: String) {
        let signer_account_id = env::signer_account_id().as_str().to_string();
        let registered_name = [signer_account_id, name].join("/");
        log!("Registering function with account and name {}", &registered_name);
        self.registry.insert(registered_name, code);
    }

    pub fn remove_indexer_function(&mut self, name: String) {
        let signer_account_id = env::signer_account_id().as_str().to_string();
        let registered_name = [signer_account_id, name].join("/");
        log!("Removing function with account and name {}", &registered_name);
        self.registry.remove(&registered_name);
    }

    pub fn list_indexer_functions(&self) -> HashMap<String, String> {
        self.registry.clone()
    }
}

/*
 * The rest of this file holds the inline tests for the code above
 * Learn more about Rust tests: https://doc.rust-lang.org/book/ch11-01-writing-tests.html
 */
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_empty() {
        let contract = Contract::default();
        // no registered indexers so should return the default ""
        assert_eq!(
            contract.read_indexer_function("developer.near/test".to_string()),
            "".to_string()
        );
    }

    #[test]
    fn set_then_get_indexer_function() {
        let mut contract = Contract::default();
        contract.register_indexer_function("test".to_string(), "var x= 1;".to_string());
        assert_eq!( // default account is bob.near
            contract.read_indexer_function("bob.near/test".to_string()),
            "var x= 1;".to_string()
        );
    }

    #[test]
    fn set_then_get_then_remove_indexer_function() {
        let mut contract = Contract::default();
        contract.register_indexer_function("test".to_string(), "var x= 1;".to_string());
        assert_eq!( // default account is bob.near
                    contract.read_indexer_function("bob.near/test".to_string()),
                    "var x= 1;".to_string()
        );
        contract.remove_indexer_function("test".to_string());
        assert_eq!(
                    contract.read_indexer_function("bob.near/test".to_string()),
                    "".to_string()
        );
    }

    #[test]
    fn set_then_list_indexer_functions() {
        let mut contract = Contract::default();
        contract.register_indexer_function("test".to_string(), "var x= 1;".to_string());
        let mut expected = HashMap::new();
        expected.insert("bob.near/test".to_string(), "var x= 1;".to_string());
        assert_eq!(contract.list_indexer_functions(), expected);
    }
}
