FROM rust:1.68 AS build

WORKDIR /tmp/
COPY Cargo.toml Cargo.lock ./
COPY storage/Cargo.toml ./storage/
COPY indexer_rule_type/Cargo.toml ./indexer_rule_type/
COPY indexer_rules_engine/Cargo.toml ./indexer_rules_engine/
COPY queryapi_coordinator/Cargo.toml ./queryapi_coordinator/

# We have to use sparse-registry cargo feature to avoid running out of RAM (version 1.68+)
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
RUN /bin/bash -c "mkdir -p {queryapi_coordinator,indexer_rule_type,indexer_rules_engine,storage}/src" && \
    echo 'fn main() {}' > queryapi_coordinator/src/main.rs && \
    touch indexer_rule_type/src/lib.rs && \
    touch indexer_rules_engine/src/lib.rs && \
    touch storage/src/lib.rs && \
    cargo build

COPY ./ ./

RUN cargo build --release --package queryapi_coordinator --offline


FROM ubuntu:20.04

RUN apt update && apt install -yy openssl ca-certificates

USER nobody
COPY --from=build /tmp/target/release/queryapi_coordinator /queryapi_coordinator
ENTRYPOINT ["/queryapi_coordinator"]
