// TODO: Improve README further

Generating schema.json
graphql-client introspect-schema --output PATH_TO_SOMEWHERE HASURA_ENDPOINT/v1/graphql --header 'x-hasura-role: SOME_HASURA_ROLE'

Generating Rust types file for query
graphql-client generate --schema-path PATH_TO_SCHEMA_JSON --response-derives 'Debug' --output-directory PATH_TO_GRAPHQL_QUERIES_FOLDER PATH_TO_QUERY_GRAPHQL_FILE
After the codegen comples, you may need to manually modify the file further to resolve issues such as "super::date" not being found.
