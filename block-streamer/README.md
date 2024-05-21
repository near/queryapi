// TODO: Improve README further

## GraphQL Code Generation
Querying a GraphQL requires informing Rust of the correct types to deserialize the response data into. In order to do this, the schema of the GraphQL data needs to be introspected. Following that, the query intended to be called needs to be fully defined. With this information, code can be generated using the graphql-client API. Below are the instructions on how to do so. 

### Generating schema.json
Run the following command with the relevant sections replaced. It will create a JSON containing schemas for ALL tables under some Hasura Role. 
`graphql-client introspect-schema --output PATH_TO_SOMEWHERE HASURA_ENDPOINT/v1/graphql --header 'x-hasura-role: SOME_HASURA_ROLE'`

### Generating Rust types file for query
Run the following command with the correct arguments to generate a Rust file containing Structs and Modules to deserialize GraphQL responses for that particular query. After the codegen completes, you may need to manually modify the file further to resolve type issues. For example, replacing `super::date` with `String`. 
`graphql-client generate --schema-path PATH_TO_SCHEMA_JSON --response-derives 'Debug' --output-directory PATH_TO_GRAPHQL_QUERIES_FOLDER PATH_TO_QUERY_GRAPHQL_FILE`
