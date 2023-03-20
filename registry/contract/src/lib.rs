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
    registry: IndexerRegistry,
    admins: Vec<Admin>,
}

pub type IndexerRegistry = HashMap<AccountId, IndexersByAccount>;

pub type IndexersByAccount = HashMap<FunctionName, IndexerConfig>;

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

/// These roles are used to control access across the various contract methods.
///
/// Owners
/// Owners are defined within the contract default state, and can only be modified via
/// a contract upgrade. The inention is for Owners to be able to execute any action.
///
/// Moderator
/// Moderators can only be invited, and also removed, by Owners. The intention behind this role
/// is for allowing addition/removal of any accounts functions.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub enum AdminRole {
    Owner,
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
                    role: AdminRole::Owner,
                },
                Admin {
                    account_id: AccountId::new_unchecked("pavelnear.near".to_string()),
                    role: AdminRole::Owner,
                },
                Admin {
                    account_id: AccountId::new_unchecked("roshaan.near".to_string()),
                    role: AdminRole::Owner,
                },
                Admin {
                    account_id: AccountId::new_unchecked("flatirons.near".to_string()),
                    role: AdminRole::Owner,
                },
                Admin {
                    account_id: AccountId::new_unchecked("root.near".to_string()),
                    role: AdminRole::Owner,
                },
                Admin {
                    account_id: AccountId::new_unchecked("khorolets.near".to_string()),
                    role: AdminRole::Owner,
                },
                Admin {
                    account_id: env::current_account_id(),
                    role: AdminRole::Owner,
                },
            ],
        }
    }
}

// Implement the contract structure
#[near_bindgen]
impl Contract {
    /* #[private]
    #[init(ignore_state)] */
    /* pub fn migrate() -> Self {
        let state: OldState = env::state_read().expect("Failed to deserialize contract state");

        Self {
            registry: state.registry,
            admins: Self::default().admins,
        }
    } */

    // Public method - returns a function previously registered under this name or empty string
    pub fn read_indexer_function(&self, function_name: String) -> IndexerConfig {
        let account_indexers = self
            .registry
            .get(&env::predecessor_account_id())
            .unwrap_or_else(|| {
                env::panic_str(
                    format!(
                        "Account {} has no registered functions",
                        env::predecessor_account_id()
                    )
                    .as_str(),
                )
            });

        let indexer_config = account_indexers.get(&function_name).unwrap_or_else(|| {
            env::panic_str(
                format!(
                    "Function {} is not registered under account {}",
                    &function_name,
                    env::predecessor_account_id()
                )
                .as_str(),
            )
        });

        indexer_config.clone()
    }

    pub fn assert_roles(&self, permitted_roles: Vec<AdminRole>) {
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
        self.assert_roles(vec![AdminRole::Owner]);

        let account_id = account_id.parse::<AccountId>().unwrap_or_else(|_| {
            env::panic_str(&format!("Account ID {} is invalid", account_id));
        });

        let admin = self
            .admins
            .iter()
            .find(|admin| admin.account_id == account_id);

        match admin {
            Some(admin) => {
                if !matches!(admin.role, AdminRole::Owner) {
                    self.admins.retain(|admin| admin.account_id != account_id);
                } else {
                    env::panic_str(&format!("Cannot remove owner {}", account_id));
                }
            }
            None => {
                env::panic_str(&format!("Admin {} does not exist", account_id));
            }
        }
    }

    pub fn add_admin(&mut self, account_id: String) {
        self.assert_roles(vec![AdminRole::Owner]);

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
        account_id: Option<String>,
    ) {
        let account_id = match account_id {
            Some(account_id) => {
                self.assert_roles(vec![AdminRole::Owner, AdminRole::Moderator]);

                account_id.parse::<AccountId>().unwrap_or_else(|_| {
                    env::panic_str(&format!("Account ID {} is invalid", account_id));
                })
            }
            None => env::signer_account_id(),
        };

        log!(
            "Registering function {} for account {}",
            &function_name,
            &account_id
        );

        let account_indexers = self
            .registry
            .entry(account_id.clone())
            .or_insert_with(IndexersByAccount::new);

        match account_indexers.get(&function_name) {
            Some(_) => {
                env::panic_str(&format!(
                    "Function {} is already registered under account {}",
                    &function_name, &account_id
                ));
            }
            None => {
                account_indexers.insert(
                    function_name,
                    IndexerConfig {
                        code,
                        start_block_height,
                        schema,
                    },
                );
            }
        }
    }

    pub fn remove_indexer_function(&mut self, function_name: String, account_id: Option<String>) {
        let account_id = match account_id {
            Some(account_id) => {
                self.assert_roles(vec![AdminRole::Owner, AdminRole::Moderator]);

                account_id.parse::<AccountId>().unwrap_or_else(|_| {
                    env::panic_str(&format!("Account ID {} is invalid", account_id));
                })
            }
            None => env::signer_account_id(),
        };

        log!(
            "Removing function {} under account {}",
            &function_name,
            &account_id,
        );

        let user_functions = self.registry.get_mut(&account_id).unwrap_or_else(|| {
            env::panic_str(format!("Account {} does not have any functions", account_id).as_str())
        });

        user_functions.remove(&function_name).unwrap_or_else(|| {
            env::panic_str(
                format!(
                    "Function {} does not exist on account {}",
                    &function_name, account_id
                )
                .as_str(),
            )
        });

        if user_functions.is_empty() {
            self.registry.remove(&account_id);
        }
    }

    pub fn list_indexer_functions(&self) -> IndexerRegistry {
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

    /* fn migrate_admins() {
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

        assert_eq!(
            contract.registry,
            IndexerRegistry::from(vec![(
                "bob.near".into(),
                IndexerMap::from(vec![(
                    "test".to_string(),
                    IndexerConfig {
                        code: "test".to_string(),
                        start_block_height: None,
                        schema: None,
                    }
                )])
            )])
        );

        assert_eq!(contract.admins.len(), 7);
    } */
    #[test]
    fn list_admins() {
        let admins = vec![
            Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Owner,
            },
            Admin {
                account_id: AccountId::new_unchecked("flatirons.near".to_string()),
                role: AdminRole::Moderator,
            },
        ];
        let contract = Contract {
            registry: HashMap::new(),
            admins: admins.clone(),
        };
        assert_eq!(contract.list_admins(), admins);
    }

    #[test]
    #[should_panic(expected = "Admin bob.near does not have one of required roles [Owner]")]
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
                role: AdminRole::Owner,
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
                role: AdminRole::Owner,
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
                role: AdminRole::Owner,
            }],
        };

        contract.add_admin("0".to_string());
    }

    #[test]
    #[should_panic(expected = "Cannot remove owner alice.near")]
    fn cannot_remove_owners() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![
                Admin {
                    account_id: AccountId::new_unchecked("bob.near".to_string()),
                    role: AdminRole::Owner,
                },
                Admin {
                    account_id: AccountId::new_unchecked("alice.near".to_string()),
                    role: AdminRole::Owner,
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
                role: AdminRole::Owner,
            }],
        };

        contract.remove_admin("alice.near".to_string());
    }

    #[test]
    #[should_panic(expected = "Admin bob.near does not have one of required roles [Owner]")]
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
                    role: AdminRole::Owner,
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
                role: AdminRole::Owner,
            }],
        };

        contract.remove_admin("0".to_string());
    }

    #[test]
    #[should_panic(expected = "Account bob.near is not admin")]
    fn assert_roles_should_panic_when_admin_doesnt_exist() {
        let contract = Contract::default();
        contract.assert_roles(vec![])
    }

    #[test]
    #[should_panic(expected = "Admin bob.near does not have one of required roles [Owner]")]
    fn assert_roles_should_panic_when_admin_doesnt_have_role() {
        let contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Moderator,
            }],
        };
        contract.assert_roles(vec![AdminRole::Owner])
    }

    #[test]
    fn assert_roles_should_allow_admin_with_required_role() {
        let contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Owner,
            }],
        };
        contract.assert_roles(vec![AdminRole::Owner])
    }

    #[test]
    #[should_panic(expected = "Account bob.near has no registered functions")]
    fn read_indexer_function_for_non_existant_account() {
        let contract = Contract::default();
        // no registered indexers so should return the default ""
        contract.read_indexer_function("test".to_string());
    }

    #[test]
    fn accounts_can_register_functions_for_themselves() {
        let mut contract = Contract::default();
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
            None,
        );
        assert_eq!(
            // default account is bob.near
            contract.read_indexer_function("test".to_string()),
            config
        );
    }

    #[test]
    fn moderators_can_register_functions_for_others() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Moderator,
            }],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "var x = 1;".to_string(),
            Some(434343),
            None,
            Some("alice.near".to_string()),
        );

        assert!(contract
            .registry
            .get(&AccountId::new_unchecked("alice.near".to_string()))
            .unwrap()
            .get("test")
            .is_some());
    }

    #[test]
    fn owners_can_register_functions_for_others() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Owner,
            }],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "var x = 1;".to_string(),
            Some(434343),
            None,
            Some("alice.near".to_string()),
        );

        assert!(contract
            .registry
            .get(&AccountId::new_unchecked("alice.near".to_string()))
            .unwrap()
            .get("test")
            .is_some());
    }

    #[test]
    #[should_panic(expected = "Account bob.near is not admin")]
    fn accounts_cannot_register_functions_for_others() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "var x = 1;".to_string(),
            Some(434343),
            None,
            Some("alice.near".to_string()),
        );
    }

    #[test]
    fn accounts_can_remove_their_own_functions() {
        let mut contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("bob.near".to_string()),
                IndexersByAccount::from([(
                    "test".to_string(),
                    IndexerConfig {
                        code: "var x= 1;".to_string(),
                        start_block_height: Some(43434343),
                        schema: None,
                    },
                )]),
            )]),
            admins: vec![],
        };

        contract.remove_indexer_function("test".to_string(), None);

        assert!(contract
            .registry
            .get(&AccountId::new_unchecked("bob.near".to_string()))
            .is_none());
    }

    #[test]
    #[should_panic(expected = "Account bob.near is not admin")]
    fn account_cannot_remove_functions_for_others() {
        let mut contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("alice.near".to_string()),
                IndexersByAccount::from([(
                    "test".to_string(),
                    IndexerConfig {
                        code: "var x= 1;".to_string(),
                        start_block_height: Some(43434343),
                        schema: None,
                    },
                )]),
            )]),
            admins: vec![],
        };

        contract.remove_indexer_function("test".to_string(), Some("alice.near".to_string()));
    }

    #[test]
    fn moderators_can_remove_functions_for_others() {
        let mut contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("alice.near".to_string()),
                IndexersByAccount::from([(
                    "test".to_string(),
                    IndexerConfig {
                        code: "var x= 1;".to_string(),
                        start_block_height: Some(43434343),
                        schema: None,
                    },
                )]),
            )]),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Moderator,
            }],
        };

        contract.remove_indexer_function("test".to_string(), Some("alice.near".to_string()));

        assert!(contract
            .registry
            .get(&AccountId::new_unchecked("alice.near".to_string()))
            .is_none());
    }

    #[test]
    fn owners_can_remove_functions_for_others() {
        let mut contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("alice.near".to_string()),
                IndexersByAccount::from([(
                    "test".to_string(),
                    IndexerConfig {
                        code: "var x= 1;".to_string(),
                        start_block_height: Some(43434343),
                        schema: None,
                    },
                )]),
            )]),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Moderator,
            }],
        };

        contract.remove_indexer_function("test".to_string(), Some("alice.near".to_string()));

        assert!(contract
            .registry
            .get(&AccountId::new_unchecked("alice.near".to_string()))
            .is_none());
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
            None,
        );
        assert_eq!(
            // default account is bob.near
            contract.read_indexer_function("test".to_string()),
            config
        );
    }

    #[should_panic(expected = "Function test is not registered under account bob.near")]
    fn read_non_existant_indexer_function() {
        let contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("bob.near".to_string()),
                IndexersByAccount::new(),
            )]),
            admins: vec![],
        };

        contract.read_indexer_function("test".to_string());
    }

    #[test]
    fn read_indexer_function() {
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
        };
        let contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("bob.near".to_string()),
                IndexersByAccount::from([("test".to_string(), config.clone())]),
            )]),
            admins: vec![],
        };

        assert_eq!(contract.read_indexer_function("test".to_string()), config);
    }

    #[test]
    fn register_indexer_function_for_new_account() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Owner,
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
            None,
        );

        assert_eq!(
            contract
                .registry
                .get(&AccountId::new_unchecked("bob.near".to_string()))
                .unwrap()
                .get("test")
                .unwrap(),
            &config
        );
    }

    #[test]
    fn register_indexer_function_for_existing_account() {
        let mut contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("bob.near".to_string()),
                IndexersByAccount::from([(
                    "test".to_string(),
                    IndexerConfig {
                        code: "var x= 1;".to_string(),
                        start_block_height: None,
                        schema: None,
                    },
                )]),
            )]),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Owner,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
        };

        contract.register_indexer_function(
            "test2".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema,
            None,
        );

        assert_eq!(
            contract
                .registry
                .get(&AccountId::new_unchecked("bob.near".to_string()))
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn remove_one_of_many_indexer_functions() {
        let mut contract = Contract {
            registry: IndexerRegistry::from([(
                AccountId::new_unchecked("bob.near".to_string()),
                IndexersByAccount::from([
                    (
                        "test".to_string(),
                        IndexerConfig {
                            code: "var x= 1;".to_string(),
                            start_block_height: None,
                            schema: None,
                        },
                    ),
                    (
                        "test2".to_string(),
                        IndexerConfig {
                            code: "var x= 2;".to_string(),
                            start_block_height: None,
                            schema: None,
                        },
                    ),
                ]),
            )]),
            admins: vec![],
        };

        contract.remove_indexer_function("test".to_string(), None);

        assert_eq!(
            contract
                .registry
                .get(&AccountId::new_unchecked("bob.near".to_string()))
                .unwrap()
                .len(),
            1
        );
    }

    /* fn set_then_list_indexer_functions() {
        let mut contract = Contract {
            registry: HashMap::new(),
            admins: vec![Admin {
                account_id: AccountId::new_unchecked("bob.near".to_string()),
                role: AdminRole::Owner,
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
            None,
        );
        let mut expected = HashMap::new();
        expected.insert("bob.near/test".to_string(), config);
        assert_eq!(contract.list_indexer_functions(), expected);
    } */
}
