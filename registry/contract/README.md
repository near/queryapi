# IndexerFunction Registry

A registry of indexer functions that are run by QueryAPI

<br />

When an IndexerFunction is added to the registry the calling user's account is prepended to the name of the function.
Example: `developer.near` calls `register_indexer_function("index_all_the_things", "bunch of code here" })` the function 
will be registered as `developer.near/index_all_the_things`. 
It can then be read by calling `read_indexer_function("developer.near/index_all_the_things")`.

## Methods
```
register_indexer_function({ name, code })  // Note that the name will be prefixed with the calling account
read_indexer_function({ name })  
remove_indexer_function({ name })  // Note that the name will be prefixed with the calling account
list_indexer_functions()
```

<br/> 

### Example Calls

```bash
near view registry.queryapi.testnet read_indexer_function '{"name":"developer.testnet/log"}'
near view registry.queryapi.testnet list_indexer_functions
near call registry.queryapi.testnet register_indexer_function '{"name":"log", "code": "console.log(`Block #${streamerMessage.block.header.height});"}' --accountId <ACCOUNT_ID>
near call registry.queryapi.testnet remove_indexer_function '{"name":"log"}' --accountId <ACCOUNT_ID>
```

TODO:
Add multisig deployment administration for Data team and SREs (DAO?).

## Deployment commands
    
```bash
./build.sh
near deploy --wasmFile ./target/wasm32-unknown-unknown/release/registry.wasm --accountId registry.queryapi.testnet
```