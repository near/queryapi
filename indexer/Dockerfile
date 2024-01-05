FROM rust:1.68 AS build
ARG CARGO_BUILD_MODE=release
WORKDIR /tmp/
COPY ./indexer/ ./
COPY ./runner/protos/ ./queryapi_coordinator/protos/
RUN apt update && apt install -yy protobuf-compiler
RUN if [ "$CARGO_BUILD_MODE" = "debug" ]; then \
        cargo build --package queryapi_coordinator; \
    else \
        cargo build --release --package queryapi_coordinator; \
    fi

FROM ubuntu:20.04
ARG CARGO_BUILD_MODE=release
RUN apt update && apt install -yy openssl ca-certificates
USER nobody
COPY --from=build /tmp/target/$CARGO_BUILD_MODE/queryapi_coordinator /queryapi_coordinator
ENTRYPOINT ["/queryapi_coordinator"]
