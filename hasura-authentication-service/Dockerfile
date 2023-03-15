FROM rust:1.67.1 AS builder
WORKDIR /tmp/
COPY Cargo.lock Cargo.lock
RUN echo '[workspace]\nmembers = ["hasura-authentication-service"]' > Cargo.toml
COPY hasura-authentication-service hasura-authentication-service
RUN cargo build -p hasura-authentication-service

FROM ubuntu:20.04
RUN apt update && apt install -yy openssl ca-certificates
RUN apt-get install libpq5 -y
COPY --from=builder /tmp/target/debug/hasura-authentication-service .
ENTRYPOINT [ "./hasura-authentication-service" ]
