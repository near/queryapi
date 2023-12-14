use std::collections::HashMap;

// Find all our documentation at https://docs.near.org
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::UnorderedMap;
use near_sdk::{env, log, near_bindgen, serde_json, AccountId, BorshStorageKey, CryptoHash};

use indexer_rule_type::indexer_rule::IndexerRule;

type FunctionName = String;
// Define the contract structure
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, Debug)]
pub struct Contract {
    registry: IndexersByAccount,
    account_roles: Vec<AccountRole>,
}

pub type IndexersByAccount = UnorderedMap<AccountId, IndexerConfigByFunctionName>;

pub type IndexerConfigByFunctionName = UnorderedMap<FunctionName, IndexerConfig>;

/// Enum to allow for returning either a single account's indexers or all indexers
/// This type uses `HashMap` rather than `UnorderedMap` as we need to load the
/// data into memory to return it.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(crate = "near_sdk::serde")]
pub enum AccountOrAllIndexers {
    All(HashMap<AccountId, HashMap<FunctionName, IndexerConfig>>),
    Account(HashMap<FunctionName, IndexerConfig>),
}

impl From<&IndexersByAccount> for AccountOrAllIndexers {
    fn from(indexers_by_account: &IndexersByAccount) -> Self {
        AccountOrAllIndexers::All(
            indexers_by_account
                .iter()
                .map(|(account_id, account_indexers)| {
                    (
                        account_id.clone(),
                        account_indexers
                            .iter()
                            .map(|(function_name, config)| (function_name.clone(), config.clone()))
                            .collect(),
                    )
                })
                .collect(),
        )
    }
}

impl From<&IndexerConfigByFunctionName> for AccountOrAllIndexers {
    fn from(indexer_config_by_function_name: &IndexerConfigByFunctionName) -> Self {
        AccountOrAllIndexers::Account(
            indexer_config_by_function_name
                .iter()
                .map(|(function_name, config)| (function_name.clone(), config.clone()))
                .collect(),
        )
    }
}

// Define the contract structure
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct IndexerConfig {
    code: String,
    start_block_height: Option<u64>,
    schema: Option<String>,
    filter: IndexerRule,
}

// Migration types
#[derive(BorshStorageKey, BorshSerialize)]
pub enum StorageKeys {
    Registry,            // can be removed after migration
    Account(CryptoHash), // can be removed after migration
    RegistryV1,
    AccountV1(CryptoHash),
}

#[derive(BorshDeserialize, BorshSerialize, Debug)]
pub struct OldState {
    registry: OldIndexersByAccount,
    account_roles: Vec<AccountRole>,
}
pub type OldIndexersByAccount = UnorderedMap<AccountId, OldIndexerConfigByFunctionName>;
pub type OldIndexerConfigByFunctionName = UnorderedMap<FunctionName, OldIndexerConfig>;

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct OldIndexerConfig {
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
pub enum Role {
    Owner,
    User,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct AccountRole {
    account_id: AccountId,
    role: Role,
}

// Define the default, which automatically initializes the contract
impl Default for Contract {
    fn default() -> Self {
        Self {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![
                AccountRole {
                    account_id: "morgs.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "nearpavel.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "roshaan.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "flatirons.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "root.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "khorolets.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "darunrs.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: env::current_account_id(),
                    role: Role::Owner,
                },
            ],
        }
    }
}

// Implement the contract structure
#[near_bindgen]
impl Contract {
    // Public method - returns a function previously registered under this name or empty string
    pub fn read_indexer_function(
        &self,
        function_name: String,
        account_id: Option<String>,
    ) -> IndexerConfig {
        let account_id = match account_id {
            Some(account_id) => account_id.parse::<AccountId>().unwrap_or_else(|_| {
                env::panic_str(&format!("Account ID {} is invalid", account_id));
            }),
            None => env::signer_account_id(),
        };

        let account_indexers = self.registry.get(&account_id).unwrap_or_else(|| {
            env::panic_str(format!("Account {} has no registered functions", account_id).as_str())
        });

        let indexer_config = account_indexers.get(&function_name).unwrap_or_else(|| {
            env::panic_str(
                format!(
                    "Function {} is not registered under account {}",
                    &function_name, account_id
                )
                .as_str(),
            )
        });

        indexer_config.clone()
    }

    pub fn assert_roles(&self, permitted_roles: Vec<Role>) {
        let account_id = env::signer_account_id();
        let account = self
            .account_roles
            .iter()
            .find(|admin| admin.account_id == account_id);

        match account {
            Some(admin) => {
                if permitted_roles.iter().any(|role| *role == admin.role) {
                    return;
                }
                env::panic_str(&format!(
                    "Account {} does not have one of required roles {:?}",
                    admin.account_id, permitted_roles
                ));
            }
            None => {
                env::panic_str(&format!("Account {} does not have any roles", account_id,));
            }
        }
    }

    pub fn list_account_roles(&self) -> Vec<AccountRole> {
        self.account_roles.clone()
    }

    pub fn remove_user(&mut self, account_id: String) {
        self.assert_roles(vec![Role::Owner]);

        let account_id = account_id.parse::<AccountId>().unwrap_or_else(|_| {
            env::panic_str(&format!("Account ID {} is invalid", account_id));
        });

        let account = self
            .account_roles
            .iter()
            .find(|account| account.account_id == account_id);

        match account {
            Some(admin) => {
                if !matches!(admin.role, Role::Owner) {
                    self.account_roles
                        .retain(|account| account.account_id != account_id);
                } else {
                    env::panic_str(&format!("Cannot remove owner account {}", account_id));
                }
            }
            None => {
                env::panic_str(&format!("Account {} does not exist", account_id));
            }
        }
    }

    pub fn add_user(&mut self, account_id: String) {
        self.assert_roles(vec![Role::Owner]);

        let account_id = account_id.parse::<AccountId>().unwrap_or_else(|_| {
            env::panic_str(&format!("Account ID {} is invalid", account_id));
        });

        if self
            .account_roles
            .iter()
            .any(|account| account.account_id == account_id)
        {
            env::panic_str(&format!("Account {} already exists", account_id));
        }

        self.account_roles.push(AccountRole {
            account_id,
            role: Role::User,
        })
    }

    // Public method - registers indexer code under <account_id> then function_name
    pub fn register_indexer_function(
        &mut self,
        function_name: String,
        code: String,
        start_block_height: Option<u64>,
        schema: Option<String>,
        account_id: Option<String>,
        filter_json: Option<String>,
    ) {
        let account_id = match account_id {
            Some(account_id) => {
                self.assert_roles(vec![Role::Owner]);

                account_id.parse::<AccountId>().unwrap_or_else(|_| {
                    env::panic_str(&format!("Account ID {} is invalid", account_id));
                })
            }
            None => {
                self.assert_roles(vec![Role::Owner, Role::User]);
                env::signer_account_id()
            }
        };

        let filter_rule: IndexerRule = match filter_json {
            Some(filter_json) => {
                let filter_rule: IndexerRule =
                    serde_json::from_str(&filter_json).unwrap_or_else(|_| {
                        env::panic_str(&format!("Invalid filter JSON {}", filter_json));
                    });

                filter_rule
            }
            None => indexer_rule_type::near_social_indexer_rule(),
        };

        log!(
            "Registering function {} for account {}",
            &function_name,
            &account_id
        );

        self.registry
            .entry(account_id.clone())
            .or_insert(IndexerConfigByFunctionName::new(StorageKeys::Account(
                env::sha256_array(account_id.as_bytes()),
            )))
            .insert(
                function_name,
                IndexerConfig {
                    code,
                    start_block_height,
                    schema,
                    filter: filter_rule,
                },
            );
    }

    pub fn remove_indexer_function(&mut self, function_name: String, account_id: Option<String>) {
        let account_id = match account_id {
            Some(account_id) => {
                self.assert_roles(vec![Role::Owner]);

                account_id.parse::<AccountId>().unwrap_or_else(|_| {
                    env::panic_str(&format!("Account ID {} is invalid", account_id));
                })
            }
            None => {
                self.assert_roles(vec![Role::Owner, Role::User]);
                env::signer_account_id()
            }
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

    pub fn list_indexer_functions(&self, account_id: Option<String>) -> AccountOrAllIndexers {
        match account_id {
            Some(account_id) => {
                let account_id = account_id.parse::<AccountId>().unwrap_or_else(|_| {
                    env::panic_str(&format!("Account ID {} is invalid", account_id));
                });

                let account_indexers = self.registry.get(&account_id).unwrap_or_else(|| {
                    env::panic_str(
                        format!("Account {} has no registered functions", account_id).as_str(),
                    )
                });

                AccountOrAllIndexers::from(account_indexers)
            }
            None => AccountOrAllIndexers::from(&self.registry),
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
    use indexer_rule_type::indexer_rule::{IndexerRuleKind, MatchingRule, Status};



    #[test]
    fn list_account_roles() {
        let admins = vec![
            AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            },
            AccountRole {
                account_id: "flatirons.near".parse().unwrap(),
                role: Role::User,
            },
        ];
        let contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: admins.clone(),
        };
        assert_eq!(contract.list_account_roles(), admins);
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have one of required roles [Owner]")]
    fn users_cant_add_other_users() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };
        contract.add_user("alice.near".to_string());
    }

    #[test]
    #[should_panic(expected = "Account bob.near already exists")]
    fn cannot_add_existing_user() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.add_user("bob.near".to_string());
    }

    #[test]
    fn add_user() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.add_user("alice.near".to_string());

        assert!(contract
            .account_roles
            .iter()
            .any(|account| account.account_id.to_string() == "alice.near"))
    }

    #[test]
    #[should_panic(expected = "Account ID 0 is invalid")]
    fn add_user_with_invalid_account_id() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.add_user("0".to_string());
    }

    #[test]
    #[should_panic(expected = "Cannot remove owner account alice.near")]
    fn cannot_remove_owners() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![
                AccountRole {
                    account_id: "bob.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "alice.near".parse().unwrap(),
                    role: Role::Owner,
                },
            ],
        };

        contract.remove_user("alice.near".to_string());
    }

    #[test]
    #[should_panic(expected = "Account alice.near does not exist")]
    fn cannot_remove_non_existing_user() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.remove_user("alice.near".to_string());
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have one of required roles [Owner]")]
    fn users_cant_remove_other_users() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![
                AccountRole {
                    account_id: "bob.near".parse().unwrap(),
                    role: Role::User,
                },
                AccountRole {
                    account_id: "alice.near".parse().unwrap(),
                    role: Role::User,
                },
            ],
        };

        contract.remove_user("alice.near".to_string());
    }

    #[test]
    fn remove_user() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![
                AccountRole {
                    account_id: "bob.near".parse().unwrap(),
                    role: Role::Owner,
                },
                AccountRole {
                    account_id: "alice.near".parse().unwrap(),
                    role: Role::User,
                },
            ],
        };

        contract.remove_user("alice.near".to_string());

        assert!(!contract
            .account_roles
            .iter()
            .any(|account| account.account_id.to_string() == "alice.near"))
    }

    #[test]
    #[should_panic(expected = "Account ID 0 is invalid")]
    fn remove_user_with_invalid_account_id() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.remove_user("0".to_string());
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have any roles")]
    fn assert_roles_should_panic_when_account_doesnt_exist() {
        let contract = Contract::default();
        contract.assert_roles(vec![])
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have one of required roles [Owner]")]
    fn assert_roles_should_panic_when_account_doesnt_have_role() {
        let contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };
        contract.assert_roles(vec![Role::Owner])
    }

    #[test]
    fn assert_roles_should_allow_account_with_required_role() {
        let contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };
        contract.assert_roles(vec![Role::Owner])
    }

    #[test]
    fn users_can_register_functions_for_themselves() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };

        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema.clone(),
            None,
            None,
        );

        assert_eq!(
            contract.read_indexer_function("test".to_string(), None),
            config
        );
    }

    #[test]
    fn owners_can_register_functions_for_themselves() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };
        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema.clone(),
            None,
            None,
        );
        assert_eq!(
            contract.read_indexer_function("test".to_string(), None),
            config
        );
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have any roles")]
    fn anonymous_cannot_register_functions_for_themselves() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "var x= 1;".to_string(),
            Some(43434343),
            None,
            None,
            None,
        );
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have any roles")]
    fn anonymous_cannot_register_functions_for_others() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "var x= 1;".to_string(),
            Some(43434343),
            None,
            Some("alice.near".to_string()),
            None,
        );
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have one of required roles [Owner]")]
    fn users_can_not_register_functions_for_others() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "var x = 1;".to_string(),
            Some(434343),
            None,
            Some("alice.near".to_string()),
            None,
        );
    }

    #[test]
    fn owners_can_register_functions_for_others() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "var x = 1;".to_string(),
            Some(434343),
            None,
            Some("alice.near".to_string()),
            None,
        );

        assert!(contract
            .registry
            .get(&"alice.near".parse::<AccountId>().unwrap())
            .unwrap()
            .get("test")
            .is_some());
    }

    #[test]
    fn register_indexer_function_for_new_account() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };

        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema.clone(),
            None,
            None,
        );

        assert_eq!(
            contract
                .registry
                .get(&"bob.near".parse::<AccountId>().unwrap())
                .unwrap()
                .get("test")
                .unwrap(),
            &config
        );
    }

    #[test]
    fn register_indexer_function_with_filter_function_call() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: IndexerRule {
                indexer_rule_kind: IndexerRuleKind::Action,
                matching_rule: MatchingRule::ActionFunctionCall {
                    affected_account_id: "test".to_string(),
                    function: "test".to_string(),
                    status: Status::Fail,
                },
                id: None,
                name: None,
            },
        };

        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema.clone(),
            None,
            Some(r#"{"indexer_rule_kind":"Action","matching_rule":{"rule":"ACTION_FUNCTION_CALL","affected_account_id":"test","function":"test","status":"FAIL"}}"#.to_string()),
        );

        assert_eq!(
            contract
                .registry
                .get(&"bob.near".parse::<AccountId>().unwrap())
                .unwrap()
                .get("test")
                .unwrap(),
            &config
        );
    }

    #[test]
    fn register_indexer_function_with_filter() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: IndexerRule {
                indexer_rule_kind: IndexerRuleKind::Action,
                matching_rule: MatchingRule::ActionAny {
                    affected_account_id: "test".to_string(),
                    status: Status::Success,
                },
                id: None,
                name: None,
            },
        };

        contract.register_indexer_function(
            "test".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema.clone(),
            None,
            Some(r#"{"indexer_rule_kind":"Action","matching_rule":{"rule":"ACTION_ANY","affected_account_id":"test","status":"SUCCESS"}}"#.to_string()),
        );

        assert_eq!(
            contract
                .registry
                .get(&"bob.near".parse::<AccountId>().unwrap())
                .unwrap()
                .get("test")
                .unwrap(),
            &config
        );
    }

    #[test]
    #[should_panic(expected = "Invalid filter JSON")]
    fn register_indexer_function_with_invalid_filter() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };

        let filter_json_missing_rule_type = r#"{"indexer_rule_kind":"Action","matching_rule":{"affected_account_id":"test","function":"test","status":"FAIL"}}"#;

        contract.register_indexer_function(
            "test".to_string(),
            "var x= 1;".to_string(),
            None,
            None,
            None,
            Some(filter_json_missing_rule_type.to_string()),
        );
    }

    #[test]
    fn register_indexer_function_for_existing_account() {
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let mut contract = Contract {
            registry,
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };

        contract.register_indexer_function(
            "test2".to_string(),
            config.code.clone(),
            config.start_block_height,
            config.schema,
            None,
            None,
        );

        assert_eq!(
            contract
                .registry
                .get(&"bob.near".parse::<AccountId>().unwrap())
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn users_can_remove_their_own_functions() {
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let mut contract = Contract {
            registry,
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };

        contract.remove_indexer_function("test".to_string(), None);

        assert!(contract
            .registry
            .get(&"bob.near".parse::<AccountId>().unwrap())
            .is_none());
    }

    #[test]
    fn owners_can_remove_their_own_functions() {
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let mut contract = Contract {
            registry,
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.remove_indexer_function("test".to_string(), None);

        assert!(contract
            .registry
            .get(&"bob.near".parse::<AccountId>().unwrap())
            .is_none());
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have one of required roles [Owner]")]
    fn users_cannot_remove_functions_for_others() {
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let mut contract = Contract {
            registry,
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };

        contract.remove_indexer_function("test".to_string(), Some("alice.near".to_string()));
    }

    #[test]
    fn owners_can_remove_functions_for_others() {
        let account_id = "alice.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let mut contract = Contract {
            registry,
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::Owner,
            }],
        };

        contract.remove_indexer_function("test".to_string(), Some("alice.near".to_string()));

        assert!(contract
            .registry
            .get(&"alice.near".parse::<AccountId>().unwrap())
            .is_none());
    }

    #[test]
    #[should_panic(expected = "Account bob.near does not have any roles")]
    fn anonymous_cannot_remove_functions() {
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let mut contract = Contract {
            registry,
            account_roles: vec![],
        };

        contract.remove_indexer_function("test".to_string(), None);
    }

    #[test]
    fn remove_one_of_many_indexer_functions_from_account() {
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        account_indexers.insert(
            "test2".to_string(),
            IndexerConfig {
                code: "var x= 2;".to_string(),
                start_block_height: Some(43434343),
                schema: None,
                filter: indexer_rule_type::near_social_indexer_rule(),
            },
        );
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let mut contract = Contract {
            registry,
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse::<AccountId>().unwrap(),
                role: Role::User,
            }],
        };

        contract.remove_indexer_function("test".to_string(), None);

        assert_eq!(
            contract
                .registry
                .get(&"bob.near".parse::<AccountId>().unwrap())
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    #[should_panic(expected = "Function test is not registered under account bob.near")]
    fn read_non_existant_indexer_function() {
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        registry.insert(account_id, account_indexers);
        let contract = Contract {
            registry,
            account_roles: vec![],
        };

        contract.read_indexer_function("test".to_string(), None);
    }

    #[test]
    fn read_indexer_function() {
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone());
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let contract = Contract {
            registry,
            account_roles: vec![],
        };

        assert_eq!(
            contract.read_indexer_function("test".to_string(), None),
            config
        );
    }

    #[test]
    fn read_indexer_function_from_other_account() {
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };
        let account_id = "alice.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone());
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let contract = Contract {
            registry,
            account_roles: vec![],
        };

        assert_eq!(
            contract.read_indexer_function("test".to_string(), Some("alice.near".to_string())),
            config
        );
    }

    #[test]
    #[should_panic(expected = "Account bob.near has no registered functions")]
    fn read_indexer_function_for_non_existant_account() {
        let contract = Contract::default();
        // no registered indexers so should return the default ""
        contract.read_indexer_function("test".to_string(), None);
    }

    #[test]
    fn list_indexer_functions() {
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone());
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let contract = Contract {
            registry,
            account_roles: vec![],
        };

        assert_eq!(
            contract.list_indexer_functions(None),
            AccountOrAllIndexers::All(HashMap::from([(
                "bob.near".parse().unwrap(),
                HashMap::from([("test".to_string(), config)])
            )]))
        );
    }

    #[test]
    fn list_account_indexer_functions() {
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone());
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let contract = Contract {
            registry,
            account_roles: vec![],
        };

        assert_eq!(
            contract.list_indexer_functions(Some("bob.near".to_string())),
            AccountOrAllIndexers::Account(HashMap::from([("test".to_string(), config)]))
        );
    }

    #[test]
    #[should_panic(expected = "Account bob.near has no registered functions")]
    fn list_account_empty_indexer_functions() {
        let contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![],
        };

        contract.list_indexer_functions(Some("bob.near".to_string()));
    }

    #[test]
    fn list_other_account_indexer_functions() {
        let config = IndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: indexer_rule_type::near_social_indexer_rule(),
        };
        let account_id = "alice.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone());
        let mut registry = IndexersByAccount::new(StorageKeys::Registry);
        registry.insert(account_id, account_indexers);
        let contract = Contract {
            registry,
            account_roles: vec![],
        };

        assert_eq!(
            contract.list_indexer_functions(Some("alice.near".to_string())),
            AccountOrAllIndexers::Account(HashMap::from([("test".to_string(), config)]))
        );
    }
}
