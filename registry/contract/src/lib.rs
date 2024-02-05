// Find all our documentation at https://docs.near.org
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::UnorderedMap;
use near_sdk::{env, log, near_bindgen, serde_json, AccountId, BorshStorageKey, CryptoHash};

use registry_types::{
    AccountOrAllIndexers, IndexerConfig, IndexerRuleKind, MatchingRule, OldIndexerConfig,
    OldIndexerRule, Rule, StartBlock, Status,
};

type FunctionName = String;

#[derive(BorshDeserialize, BorshSerialize, Debug)]
pub struct OldContract {
    registry: OldIndexersByAccount,
    account_roles: Vec<AccountRole>,
}

pub type OldIndexersByAccount = UnorderedMap<AccountId, OldIndexerConfigByFunctionName>;

pub type OldIndexerConfigByFunctionName = UnorderedMap<FunctionName, OldIndexerConfig>;

// Define the contract structure
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, Debug)]
pub struct Contract {
    registry: IndexersByAccount,
    account_roles: Vec<AccountRole>,
}

type IndexersByAccount = UnorderedMap<AccountId, IndexerConfigByFunctionName>;

type IndexerConfigByFunctionName = UnorderedMap<FunctionName, IndexerConfig>;

// Migration types
#[derive(BorshStorageKey, BorshSerialize)]
enum StorageKeys {
    Registry,            // can be removed after migration
    Account(CryptoHash), // can be removed after migration
    RegistryV1,
    AccountV1(CryptoHash),
    RegistryV2,
    AccountV2(CryptoHash),
    RegistryV3,
    AccountV3(CryptoHash),
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
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let state: OldContract = env::state_read().expect("failed to parse existing state");

        let mut registry = IndexersByAccount::new(StorageKeys::RegistryV3);

        for (account_id, indexers) in state.registry.iter() {
            let mut new_indexers: IndexerConfigByFunctionName = IndexerConfigByFunctionName::new(
                StorageKeys::AccountV3(env::sha256_array(account_id.as_bytes())),
            );

            for (function_name, indexer_config) in indexers.iter() {
                new_indexers.insert(function_name.to_string(), indexer_config.clone().into());
            }

            registry.insert(account_id.clone(), new_indexers);
        }

        Self {
            registry,
            account_roles: state.account_roles,
        }
    }

    pub fn near_social_indexer_rule() -> OldIndexerRule {
        let contract = "social.near";
        let method = "set";
        let matching_rule = MatchingRule::ActionFunctionCall {
            affected_account_id: contract.to_string(),
            function: method.to_string(),
            status: Status::Any,
        };
        OldIndexerRule {
            indexer_rule_kind: IndexerRuleKind::Action,
            matching_rule,
            id: None,
            name: None,
        }
    }

    // Public method - returns a function previously registered under this name or empty string
    pub fn read_indexer_function(
        &self,
        function_name: String,
        account_id: Option<String>,
    ) -> OldIndexerConfig {
        let account_id = match account_id {
            Some(account_id) => account_id.parse::<AccountId>().unwrap_or_else(|_| {
                env::panic_str(&format!("Account ID {} is invalid", account_id));
            }),
            None => env::signer_account_id(),
        };

        let account_indexers = self.registry.get(&account_id).unwrap_or_else(|| {
            env::panic_str(format!("Account {} has no registered functions", account_id).as_str())
        });

        let config = account_indexers.get(&function_name).unwrap_or_else(|| {
            env::panic_str(
                format!(
                    "Function {} is not registered under account {}",
                    &function_name, account_id
                )
                .as_str(),
            )
        });

        config.clone().into()
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

        let filter: OldIndexerRule = match filter_json {
            Some(filter_json) => {
                let filter_rule: OldIndexerRule = serde_json::from_str(&filter_json)
                    .unwrap_or_else(|e| {
                        env::panic_str(&format!("Invalid filter JSON {}", e));
                    });

                filter_rule
            }
            None => Contract::near_social_indexer_rule(),
        };

        log!(
            "Registering function {} for account {}",
            &function_name,
            &account_id
        );

        let account_indexers =
            self.registry
                .entry(account_id.clone())
                .or_insert(IndexerConfigByFunctionName::new(StorageKeys::Account(
                    env::sha256_array(account_id.as_bytes()),
                )));

        let start_block = match start_block_height {
            Some(height) => StartBlock::Height(height),
            None => StartBlock::Latest,
        };

        match account_indexers.entry(function_name) {
            near_sdk::store::unordered_map::Entry::Occupied(mut entry) => {
                let indexer = entry.get();
                entry.insert(IndexerConfig {
                    code,
                    start_block,
                    schema: schema.unwrap_or(String::new()),
                    rule: filter.matching_rule.into(),
                    updated_at_block_height: Some(env::block_height()),
                    created_at_block_height: indexer.created_at_block_height,
                });
            }
            near_sdk::store::unordered_map::Entry::Vacant(entry) => {
                entry.insert(IndexerConfig {
                    code,
                    start_block,
                    schema: schema.unwrap_or(String::new()),
                    rule: filter.matching_rule.into(),
                    updated_at_block_height: None,
                    created_at_block_height: env::block_height(),
                });
            }
        }
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

                AccountOrAllIndexers::Account(
                    account_indexers
                        .iter()
                        .map(|(function_name, config)| {
                            (function_name.clone(), config.clone().into())
                        })
                        .collect(),
                )
            }
            None => AccountOrAllIndexers::All(
                self.registry
                    .iter()
                    .map(|(account_id, account_indexers)| {
                        (
                            account_id.clone(),
                            account_indexers
                                .iter()
                                .map(|(function_name, config)| {
                                    (function_name.clone(), config.clone().into())
                                })
                                .collect(),
                        )
                    })
                    .collect(),
            ),
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

    use std::collections::HashMap;

    #[test]
    fn migrate() {
        let mut registry = OldIndexersByAccount::new(StorageKeys::RegistryV2);
        let account_id = "morgs.near".parse::<AccountId>().unwrap();
        let mut functions = OldIndexerConfigByFunctionName::new(StorageKeys::AccountV2(
            env::sha256_array(account_id.as_bytes()),
        ));

        functions.insert(
            "test".to_string(),
            OldIndexerConfig {
                code: "return block;".to_string(),
                start_block_height: None,
                schema: None,
                filter: Contract::near_social_indexer_rule(),
                created_at_block_height: 10,
                updated_at_block_height: None,
            },
        );
        functions.insert(
            "test2".to_string(),
            OldIndexerConfig {
                code: "return block2;".to_string(),
                start_block_height: Some(100),
                schema: Some(String::from("create table blah")),
                filter: OldIndexerRule {
                    id: None,
                    name: None,
                    indexer_rule_kind: IndexerRuleKind::Action,
                    matching_rule: MatchingRule::ActionAny {
                        affected_account_id: String::from("social.near"),
                        status: Status::Success,
                    },
                },
                created_at_block_height: 10,
                updated_at_block_height: Some(20),
            },
        );
        registry.insert(account_id.clone(), functions);

        env::state_write(&OldContract {
            registry,
            account_roles: Contract::default().account_roles,
        });

        let contract = Contract::migrate();

        assert_eq!(
            contract
                .registry
                .get(&account_id)
                .unwrap()
                .get("test")
                .unwrap(),
            &IndexerConfig {
                code: "return block;".to_string(),
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionFunctionCall {
                    affected_account_id: String::from("social.near"),
                    status: Status::Any,
                    function: String::from("set")
                },
                updated_at_block_height: None,
                created_at_block_height: 10,
            }
        );
        assert_eq!(
            contract
                .registry
                .get(&account_id)
                .unwrap()
                .get("test2")
                .unwrap(),
            &IndexerConfig {
                code: "return block2;".to_string(),
                schema: String::from("create table blah"),
                start_block: StartBlock::Height(100),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success
                },
                updated_at_block_height: Some(20),
                created_at_block_height: 10,
            }
        );
        assert_eq!(contract.account_roles, Contract::default().account_roles);
    }

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
            .any(|account| account.account_id == "alice.near"))
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
            .any(|account| account.account_id == "alice.near"))
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
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
            OldIndexerConfig::from(
                contract
                    .registry
                    .get(&"bob.near".parse::<AccountId>().unwrap())
                    .unwrap()
                    .get("test")
                    .unwrap()
                    .clone()
            ),
            config
        );
    }

    #[test]
    fn sets_updated_at_and_created_at_for_new_account() {
        let mut contract = Contract {
            registry: IndexersByAccount::new(StorageKeys::Registry),
            account_roles: vec![AccountRole {
                account_id: "bob.near".parse().unwrap(),
                role: Role::User,
            }],
        };

        contract.register_indexer_function(
            "test".to_string(),
            "".to_string(),
            Some(100),
            Some("".to_string()),
            None,
            None,
        );

        let indexer_config = contract
            .registry
            .get(&"bob.near".parse::<AccountId>().unwrap())
            .unwrap()
            .get("test")
            .unwrap();

        assert_eq!(indexer_config.updated_at_block_height, None);
        assert_eq!(indexer_config.created_at_block_height, env::block_height());
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: OldIndexerRule {
                indexer_rule_kind: IndexerRuleKind::Action,
                matching_rule: MatchingRule::ActionFunctionCall {
                    affected_account_id: "test".to_string(),
                    function: "test".to_string(),
                    status: Status::Fail,
                },
                id: None,
                name: None,
            },
            updated_at_block_height: None,
            created_at_block_height: 0,
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
            OldIndexerConfig::from(
                contract
                    .registry
                    .get(&"bob.near".parse::<AccountId>().unwrap())
                    .unwrap()
                    .get("test")
                    .unwrap()
                    .clone()
            ),
            config
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: OldIndexerRule {
                indexer_rule_kind: IndexerRuleKind::Action,
                matching_rule: MatchingRule::ActionAny {
                    affected_account_id: "test".to_string(),
                    status: Status::Success,
                },
                id: None,
                name: None,
            },
            updated_at_block_height: None,
            created_at_block_height: 0,
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
            OldIndexerConfig::from(
                contract
                    .registry
                    .get(&"bob.near".parse::<AccountId>().unwrap())
                    .unwrap()
                    .get("test")
                    .unwrap()
                    .clone()
            ),
            config
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
    fn sets_updated_at_and_created_at_for_existing_account() {
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert(
            "test".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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

        contract.register_indexer_function(
            "test".to_string(),
            "".to_string(),
            Some(100),
            Some("".to_string()),
            None,
            None,
        );

        let indexer_config = contract
            .registry
            .get(&"bob.near".parse::<AccountId>().unwrap())
            .unwrap()
            .get("test")
            .unwrap();

        assert_eq!(
            indexer_config.updated_at_block_height,
            Some(env::block_height())
        );
        assert_eq!(indexer_config.created_at_block_height, 100);
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
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
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
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
            },
        );
        account_indexers.insert(
            "test2".to_string(),
            IndexerConfig {
                code: "var x= 1;".to_string(),
                start_block: StartBlock::Latest,
                schema: String::new(),
                rule: Rule::ActionAny {
                    affected_account_id: String::from("social.near"),
                    status: Status::Success,
                },
                updated_at_block_height: None,
                created_at_block_height: 100,
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
        };

        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone().into());
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: None,
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
        };
        let account_id = "alice.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone().into());
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
        };
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone().into());
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
        };
        let account_id = "bob.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone().into());
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
        let config = OldIndexerConfig {
            code: "var x= 1;".to_string(),
            start_block_height: Some(43434343),
            schema: None,
            filter: Contract::near_social_indexer_rule(),
            updated_at_block_height: None,
            created_at_block_height: 0,
        };
        let account_id = "alice.near".parse::<AccountId>().unwrap();
        let mut account_indexers = IndexerConfigByFunctionName::new(StorageKeys::Account(
            env::sha256_array(account_id.as_bytes()),
        ));
        account_indexers.insert("test".to_string(), config.clone().into());
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
