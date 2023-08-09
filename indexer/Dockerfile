FROM rust:1.68 AS build

WORKDIR /tmp/
COPY ./ ./

RUN cargo build --release --package queryapi_coordinator --offline


FROM ubuntu:20.04

RUN apt update && apt install -yy openssl ca-certificates

USER nobody
COPY --from=build /tmp/target/release/queryapi_coordinator /queryapi_coordinator
ENTRYPOINT ["/queryapi_coordinator"]
