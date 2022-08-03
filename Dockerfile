FROM rust:1.61.0 AS build

# We have to use sparse-registry nightly cargo feature to avoid running out of RAM:
# https://github.com/rust-lang/cargo/issues/10781
RUN rustup toolchain install nightly-2022-06-20 && rustup override set nightly-2022-06-20

WORKDIR /tmp/
COPY Cargo.toml Cargo.lock ./
COPY alertexer/Cargo.toml ./alertexer/
COPY alert-rules/Cargo.toml ./alert-rules/
COPY shared/Cargo.toml ./shared/
COPY storage/Cargo.toml ./storage/

RUN /bin/bash -c "mkdir -p {alertexer,alert-rules,shared,storage}/src" && \
    echo 'fn main() {}' > alertexer/src/main.rs && \
    touch alert-rules/src/lib.rs && \
    touch shared/src/lib.rs && \
    touch storage/src/lib.rs && \
    cargo build -Z sparse-registry

COPY ./ ./

RUN cargo build --release --package alertexer -Z sparse-registry --offline


FROM ubuntu:20.04

RUN apt update && apt install -yy openssl ca-certificates

USER nobody
COPY --from=build /tmp/target/release/alertexer /alertexer
ENTRYPOINT ["/alertexer"]
