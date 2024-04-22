FROM hasura/graphql-engine:latest.cli-migrations-v3

ARG DATABASE_URL
ARG PORT

COPY migrations /hasura-migrations
COPY metadata /hasura-metadata

CMD graphql-engine serve
