use std::collections::HashMap;

// Find all our documentation at https://docs.near.org
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, log, near_bindgen};
use near_sdk::json_types::Base64VecU8;

type FunctionName = String;
// Define the contract structure
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct Contract {
    registry: HashMap<FunctionName, IndexerConfig>,
    // admins: Vec<String>,
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
            registry: HashMap::new(),
            users: HashMap::new(),
            // admins: vec!["pavelnear.near".to_string(), "roshaan.near".to_string(),
            //              "flatirons.near".to_string(), "root.near".to_string(),
            //              "khorolets.near".to_string()],
        }
    }
}

// Implement the contract structure
#[near_bindgen]
impl Contract {

    fn check_registered_user(&self, signer_account_id: &String) -> () {
        let admins = vec!["nearpavel.near".to_string(), "roshaan.near".to_string(),
            "flatirons.near".to_string(), "root.near".to_string(), "khorolets.near".to_string(),
            "morgs.near".to_string(), "somepublicaddress.near".to_string()];
        if !admins.contains(signer_account_id) {
            env::panic_str("Only alpha users can register or remove functions");
        }
    }

    // Public method - returns a function previously registered under this name or empty string
    pub fn read_indexer_function(&self, function_name: String) -> IndexerConfig {
        match self.registry.get(&function_name) {
            Some(config) => config.clone(),
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

        self.check_registered_user(&signer_account_id);

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
        self.registry.insert(registered_name, config);
    }

    pub fn remove_indexer_function(&mut self, function_name: String) {
        let signer_account_id = env::signer_account_id().as_str().to_string();

        self.check_registered_user(&signer_account_id);

        let registered_name = [signer_account_id, function_name].join("/");
        log!(
            "Removing function with account and function_name {}",
            &registered_name
        );
        self.registry.remove(&registered_name);
    }

    pub fn list_indexer_functions(&self) -> HashMap<FunctionName, IndexerConfig> {
        self.registry.clone()
    }

    pub fn clean(&self, keys: Vec<Base64VecU8>) -> () {
        let signer_account_id = env::signer_account_id().as_str().to_string();
        self.check_registered_user(&signer_account_id);
        for key in keys.iter() {
            env::storage_remove(&key.0);
        }
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        // retrieve the current state from the contract
        let old_state: OldState = env::state_read().expect("failed");

        // iterate through the state migrating it to the new version
        let mut new_registry: HashMap<FunctionName, IndexerConfig> = HashMap::new();

        // Gabe updated the line above and the return clause but not much below here from the example

        for (idx, posted) in old_state.messages.iter().enumerate() {
            let payment = old_state.payments.get(idx as u64).unwrap_or(0);

            new_messages.push(&PostedMessage {
                payment,
                premium: posted.premium,
                sender: posted.sender,
                text: posted.text,
            })
        }

        // return the new state
        Self {
            registry: new_registry,
            admins,
            users,
        }
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
        let mut expected = HashMap::new();
        expected.insert("bob.near/test".to_string(), config);
        assert_eq!(contract.list_indexer_functions(), expected);
    }

    #[test]
    #[should_panic(expected = "Only alpha users can register or remove functions")]
    fn remove_indexer_function() {
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
        contract.remove_indexer_function("test".to_string());
    }
}
