#!/bin/sh
near contract deploy queryapi.dataplatform.near use-file ./target/wasm32-unknown-unknown/release/registry.wasm without-init-call network-config mainnet sign-with-keychain send
