# IndexerFunction Registry

A registry of indexer functions that are run by QueryAPI

<br />

When an IndexerFunction is added to the registry the calling user's account is prepended to the name of the function.
Example: `developer.near` calls `register_indexer_function("index_all_the_things", "bunch of code here" })` the function
will be registered as `developer.near/index_all_the_things`.
It can then be read by calling `read_indexer_function("developer.near/index_all_the_things")`.

## Methods

```
register_indexer_function({ function_name, code })  // Note that the name will be prefixed with the calling account
read_indexer_function({ function_name })
remove_indexer_function({ function_name })  // Note that the name will be prefixed with the calling account
list_indexer_functions()
```

<br/>

### Example Calls

```bash
near view registry.queryapi.testnet read_indexer_function '{"function_name":"developer.testnet/log"}'
near view registry.queryapi.testnet list_indexer_functions
near call registry.queryapi.testnet register_indexer_function '{"function_name":"log", "code": "console.log(`Block #${streamerMessage.block.header.height});"}' --accountId <ACCOUNT_ID>
near call registry.queryapi.testnet remove_indexer_function '{"function_name":"log"}' --accountId <ACCOUNT_ID>
```

TODO:
Add multisig deployment administration for Data team and SREs (DAO?).

## Deployment commands

```bash
./build.sh
near deploy --wasmFile ./target/wasm32-unknown-unknown/release/registry.wasm --accountId registry.queryapi.testnet
```

## Issues encountered while building

### Clang

The default version of `clang` on MacOS cannot build `wasm32-unknown-unknown`, therefore another version must be installed:
```sh
brew install llvm
```
and can be used via setting the `CC` environment variable:
```sh
CC="/opt/homebrew/Cellar/llvm/17.0.6/bin/clang" cargo build --target wasm32-unknown-unknown
```

### near-primitives usize
The `near-primitives` crate internally hard-codes `usize` as 8bits, this becomes a problem when targetting 32bit architecture (wasm32), which expects a `usize` of 4bits. To Bypass this issue the following patch can be applied to the local version of the crate in `~/.cargo/registry/src/index.crates.io-6f17d22bba15001f/near-primitives-0.17.0/src/rand.rs`:
```patch
diff --git a/core/primitives/src/rand.rs b/core/primitives/src/rand.rs
index a79c8fd1b..17978a199 100644
--- a/core/primitives/src/rand.rs
+++ b/core/primitives/src/rand.rs
@@ -57,16 +57,7 @@ impl WeightedIndex {
     }
 
     pub fn sample(&self, seed: [u8; 32]) -> usize {
-        let usize_seed = Self::copy_8_bytes(&seed[0..8]);
-        let balance_seed = Self::copy_16_bytes(&seed[8..24]);
-        let uniform_index = usize::from_le_bytes(usize_seed) % self.aliases.len();
-        let uniform_weight = Balance::from_le_bytes(balance_seed) % self.weight_sum;
-
-        if uniform_weight < self.no_alias_odds[uniform_index] {
-            uniform_index
-        } else {
-            self.aliases[uniform_index] as usize
-        }
+        0
     }
 
     pub fn get_aliases(&self) -> &[u64] {
```
