FROM rust:1.75 AS build
ARG CARGO_BUILD_MODE=debug
WORKDIR /tmp/
COPY block-streamer/ block-streamer/
COPY registry/types/ registry/types/
WORKDIR /tmp/block-streamer/
RUN apt update && apt install -yy protobuf-compiler
RUN cargo build --package block-streamer

FROM ubuntu:22.04
ARG CARGO_BUILD_MODE=debug
ENV RUST_LOG=info
RUN apt update && apt install -yy openssl ca-certificates
USER nobody
COPY --from=build /tmp/block-streamer/target/$CARGO_BUILD_MODE/block-streamer /block-streamer
ENTRYPOINT ["/block-streamer"]
