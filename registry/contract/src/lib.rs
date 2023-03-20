use std::collections::HashMap;

// Find all our documentation at https://docs.near.org
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, log, near_bindgen, AccountId};

type FunctionName = String;
// Define the contract structure
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, Debug)]
pub struct Contract {
    registry: HashMap<FunctionName, IndexerConfig>,
    admins: Vec<Admin>,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, Debug)]
pub struct OldState {
    registry: HashMap<FunctionName, IndexerConfig>,
}

// Define the contract structure
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct IndexerConfig {
    code: String,
    start_block_height: Option<u64>,
    schema: Option<String>,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub enum AdminRole {
    Super,
    Moderator,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct Admin {
    account_id: AccountId,
    role: AdminRole,
}

// Define the default, which automatically initializes the contract
impl Default for Contract {
    fn default() -> Self {
        Self {
            registry: HashMap::new(),
            admins: vec![
                Admin {
                    account_id: AccountId::new_unchecked("morgs.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("pavelnear.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("roshaan.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("flatirons.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("root.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("khorolets.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: env::current_account_id(),
                    role: AdminRole::Super,
                },
            ],
        }
    }
}

// Implement the contract structure
#[near_bindgen]
impl Contract {
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let state: OldState = env::state_read().expect("Failed to deserialize contract state");

        Self {
            registry: state.registry,
            admins: Self::default().admins,
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

    pub fn assert_admin(&self, permitted_roles: Vec<AdminRole>) {
        let account_id = env::signer_account_id();
        let admin = self
            .admins
            .iter()
            .find(|admin| admin.account_id == account_id);

        match admin {
            Some(admin) => {
                if permitted_roles.iter().any(|role| *role == admin.role) {
                    return;
                }
                env::panic_str(&format!(
                    "Admin {} does not have one of required roles {:?}",
                    admin.account_id, permitted_roles
                ));
            }
            None => {
                env::panic_str(&format!("Account {} is not admin", account_id));
            }
        }
    }

    pub fn list_admins(&self) -> Vec<Admin> {
        self.admins.clone()
    }

    pub fn remove_admin(&mut self, account_id: String) {
        self.assert_admin(vec![AdminRole::Super]);

        let account_id = account_id.parse::<AccountId>().unwrap_or_else(|_| {
            env::panic_str(&format!("Account ID {} is invalid", account_id));
        });

        let admin = self
            .admins
            .iter()
            .find(|admin| admin.account_id == account_id);

        match admin {
            Some(admin) => {
                if admin.role == AdminRole::Super {
                    env::panic_str(&format!("Cannot remove super admin {}", account_id));
                }

                self.admins.retain(|admin| admin.account_id != account_id);
            }
            None => {
                env::panic_str(&format!("Admin {} does not exist", account_id));
            }
        }
    }

    pub fn add_admin(&mut self, account_id: String) {
        self.assert_admin(vec![AdminRole::Super]);

        let account_id = account_id.parse::<AccountId>().unwrap_or_else(|_| {
            env::panic_str(&format!("Account ID {} is invalid", account_id));
        });

        if self
            .admins
            .iter()
            .any(|admin| admin.account_id == account_id)
        {
            env::panic_str(&format!("Admin {} already exists", account_id));
        }

        self.admins.push(Admin {
            account_id,
            role: AdminRole::Moderator,
        })
    }

    // Public method - registers indexer code under <account_id>/function_name
    pub fn register_indexer_function(
        &mut self,
        function_name: String,
        code: String,
        start_block_height: Option<u64>,
        schema: Option<String>,
    ) {
        self.assert_admin(vec![AdminRole::Super, AdminRole::Moderator]);

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
        self.registry.insert(registered_name, config);
    }

    pub fn remove_indexer_function(&mut self, function_name: String) {
        self.assert_admin(vec![AdminRole::Super, AdminRole::Moderator]);

        let signer_account_id = env::signer_account_id().as_str().to_string();
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

    // #[private]
    // #[init(ignore_state)]
    pub fn clean(keys: Vec<Base64VecU8>) {
        for key in keys.iter() {
            env::storage_remove(&key.0);
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
    fn migrate_admins() {
        env::state_write(&OldState {
            registry: HashMap::from([(
                "test".to_string(),
                IndexerConfig {
                    code: "test".to_string(),
                    start_block_height: None,
                    schema: None,
                },
            )]),
        });
        let contract = Contract::migrate();

        assert_eq!(contract.registry.len(), 1);
        assert_eq!(contract.admins.len(), 7);
    }

    #[test]
    fn list_admins() {
        let contract = Contract {
            registry: HashMap::new(),
            admins: vec![
                Admin {
                    account_id: AccountId::new_unchecked("bob.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("flatirons.near".to_string()),
                    role: AdminRole::Moderator,
                },
            ],
        };
        assert_eq!(
            contract.list_admins(),
            vec![
                Admin {
                    account_id: AccountId::new_unchecked("bob.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("flatirons.near".to_string()),
                    role: AdminRole::Moderator,
                },
            ],
        );
    }

    #[test]
    #[should_panic(expected = "Admin bob.near does not have one of required roles [Super]")]
    fn moderators_cant_add_other_admins() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Moderator,
            }],
        };
        contract.add_admin("alice.near".to_string());
    }

    #[test]
    #[should_panic(expected = "Admin bob.near already exists")]
    fn cannot_add_existing_admin() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };

        contract.add_admin("bob.near".to_string());
    }

    #[test]
    fn add_admin() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };

        contract.add_admin("alice.near".to_string());

        assert!(contract
            .admins
            .iter()
            .any(|admin| admin.account_id.to_string() == "alice.near"))
    }

    #[test]
    #[should_panic(expected = "Account ID 0 is invalid")]
    fn add_admin_with_invalid_account_id() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };

        contract.add_admin("0".to_string());
    }

    #[test]
    #[should_panic(expected = "Cannot remove super admin alice.near")]
    fn cannot_remove_super_admins() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![
                Admin {
                    account_id: AccountId::new_unchecked("bob.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("alice.near".to_string()),
                    role: AdminRole::Super,
                },
            ],
        };

        contract.remove_admin("alice.near".to_string());
    }

    #[test]
    #[should_panic(expected = "Admin alice.near does not exist")]
    fn cannot_remove_non_existing_admin() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };

        contract.remove_admin("alice.near".to_string());
    }

    #[test]
    #[should_panic(expected = "Admin bob.near does not have one of required roles [Super]")]
    fn moderators_cant_remove_other_admins() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![
                Admin {
                    account_id: AccountId::new_unchecked("bob.near".to_string()),
                    role: AdminRole::Moderator,
                },
                Admin {
                    account_id: AccountId::new_unchecked("alice.near".to_string()),
                    role: AdminRole::Moderator,
                },
            ],
        };
        contract.remove_admin("alice.near".to_string());
    }

    #[test]
    fn remove_admin() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![
                Admin {
                    account_id: AccountId::new_unchecked("bob.near".to_string()),
                    role: AdminRole::Super,
                },
                Admin {
                    account_id: AccountId::new_unchecked("alice.near".to_string()),
                    role: AdminRole::Moderator,
                },
            ],
        };

        contract.remove_admin("alice.near".to_string());

        assert!(!contract
            .admins
            .iter()
            .any(|admin| admin.account_id.to_string() == "alice.near"))
    }

    #[test]
    #[should_panic(expected = "Account ID 0 is invalid")]
    fn remove_admin_with_invalid_account_id() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };

        contract.remove_admin("0".to_string());
    }

    #[test]
    #[should_panic(expected = "Account bob.near is not admin")]
    fn assert_admin_should_panic_when_admin_doesnt_exist() {
        let contract = Contract::default();
        contract.assert_admin(vec![])
    }

    #[test]
    #[should_panic(expected = "Admin bob.near does not have one of required roles [Super]")]
    fn assert_admin_should_panic_when_admin_doesnt_have_role() {
        let contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Moderator,
            }],
        };
        contract.assert_admin(vec![AdminRole::Super])
    }

    #[test]
    fn assert_admin_should_allow_admin_with_required_role() {
        let contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };
        contract.assert_admin(vec![AdminRole::Super])
    }

    #[test]
    #[should_panic(expected = "The function_name developer.near/test is not registered")]
    fn get_empty() {
        let contract = Contract::default();
        // no registered indexers so should return the default ""
        contract.read_indexer_function("developer.near/test".to_string());
    }

    #[test]
    fn set_then_get_indexer_function() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Moderator,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
        };
        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
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
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
        };
        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
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
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Super,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(4343333),
            schema: Some("key: string, value: string".to_string()),
        };
        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema.clone(),
        );
        let mut expected = HashMap::new();
        expected.insert("bob.near/test".to_string(), config);
        assert_eq!(contract.list_indexer_functions(), expected);
    }
}
