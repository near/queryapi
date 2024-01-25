FROM rust:1.75 AS build
ARG CARGO_BUILD_MODE=release
WORKDIR /tmp/
COPY coordinator/ coordinator/
COPY registry/types/ registry/types/
COPY block-streamer/ block-streamer/
COPY runner-client/ runner-client/
WORKDIR /tmp/coordinator/
RUN apt update && apt install -yy protobuf-compiler
RUN if [ "$CARGO_BUILD_MODE" = "debug" ]; then \
        cargo build; \
    else \
        cargo build --release; \
    fi


FROM ubuntu:22.04
ARG CARGO_BUILD_MODE=release
RUN apt update && apt install -yy openssl ca-certificates
USER nobody
COPY --from=build /tmp/coordinator/target/$CARGO_BUILD_MODE/coordinator /coordinator
ENTRYPOINT ["/coordinator"]
