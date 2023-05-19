#!/bin/sh

echo ">> Building contract"

rustup target add wasm32-unknown-unknown
cargo build --all --target wasm32-unknown-unknown --release

# handle
# https://github.com/near/nearcore/issues/8358
cargo install wasm-opt --locked
wasm-opt -Oz --signext-lowering target/wasm32-unknown-unknown/release/registry.wasm -o target/wasm32-unknown-unknown/release/registry.wasm;
