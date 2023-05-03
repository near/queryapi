FROM rust:1.67.1 AS builder
WORKDIR /tmp/
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release

FROM ubuntu:20.04
RUN apt update && apt install -yy openssl ca-certificates
RUN apt-get install libpq5 -y
COPY --from=builder /tmp/target/release/hasura-authentication-service .
ENTRYPOINT [ "./hasura-authentication-service" ]
