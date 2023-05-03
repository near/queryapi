FROM rust:1.68 AS build

WORKDIR /tmp/
COPY Cargo.toml Cargo.lock ./
COPY alertexer-types/Cargo.toml ./alertexer-types/
COPY alert-rules/Cargo.toml ./alert-rules/
COPY shared/Cargo.toml ./shared/
COPY storage/Cargo.toml ./storage/
COPY queryapi_coordinator/Cargo.toml ./queryapi_coordinator/

# We have to use sparse-registry cargo feature to avoid running out of RAM (version 1.68+)
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
RUN /bin/bash -c "mkdir -p {queryapi_coordinator,alertexer-types,alert-rules,shared,storage}/src" && \
    echo 'fn main() {}' > queryapi_coordinator/src/main.rs && \
    touch alertexer-types/src/lib.rs && \
    touch alert-rules/src/lib.rs && \
    touch shared/src/lib.rs && \
    touch storage/src/lib.rs && \
    cargo build

COPY ./ ./

RUN cargo build --release --package queryapi_coordinator --offline


FROM ubuntu:20.04

RUN apt update && apt install -yy openssl ca-certificates

USER nobody
COPY --from=build /tmp/target/release/queryapi_coordinator /queryapi_coordinator
ENTRYPOINT ["/queryapi_coordinator"]
