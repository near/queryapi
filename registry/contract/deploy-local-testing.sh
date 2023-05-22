#!/bin/sh
near deploy --wasmFile ./target/wasm32-unknown-unknown/release/registry.wasm --accountId registry.queryapi.near
