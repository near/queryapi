FROM rust:1.61.0 AS build
ARG package

# We have to use sparse-registry nightly cargo feature to avoid running out of RAM:
# https://github.com/rust-lang/cargo/issues/10781
RUN rustup toolchain install nightly

WORKDIR /tmp/
COPY Cargo.toml Cargo.lock ./
COPY actions-alertexer/Cargo.toml ./actions-alertexer/
COPY alert-rules/Cargo.toml ./alert-rules/
COPY shared/Cargo.toml ./shared/
COPY storage/Cargo.toml ./storage/

RUN /bin/bash -c "mkdir -p {actions-alertexer,alert-rules,shared,storage}/src" && \
    echo 'fn main() {}' > actions-alertexer/src/main.rs && \
    touch alert-rules/src/lib.rs && \
    touch shared/src/lib.rs && \
    touch storage/src/lib.rs && \
    cargo +nightly build -Z sparse-registry

COPY ./ ./

RUN cargo +nightly build --release --package $package -Z sparse-registry --offline


FROM ubuntu:20.04
ARG package

RUN apt update && apt install -yy openssl ca-certificates

USER nobody
COPY --from=build /tmp/target/release/$package /alertexer
ENTRYPOINT ["/alertexer"]
