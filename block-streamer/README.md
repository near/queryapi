// TODO: Improve README further

## GraphQL Code Generation
Querying a GraphQL requires informing Rust of the correct types to deserialize the response data into. In order to do this, the schema of the GraphQL data needs to be introspected. Following that, the query intended to be called needs to be fully defined. With this information, code can be automatically generated using the macro provided in graphql-client. Below are the instructions on how to do so. 

### Generating schema.graphql
Follow the instructions in the [Hasura Documentation](https://hasura.io/docs/latest/schema/common-patterns/export-graphql-schema/) to introspect the schema and generate the graphql file. Keep in mind that a header for the role needs to be provided. Otherwise, the schemas remain hidden from the public/default user.

For example: `gq https://my-graphql-engine.com/v1/graphql -H 'X-Hasura-Role: someaccount_near' --introspect > schema.graphql`

### Generating Rust types from query
After acquiring the graphql file for the schema, write the queries that need to be called in individual graphql files. Once written, add the following code template to a Rust file and the code will be auto generated using the macro. Assuming there are no problems generating the code, the code will be immediately usable. 

```
#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "PATH/TO/schema.graphql",
    query_path = "PATH/TO/query.graphql",
    response_derives = "Debug",
    normalization = "rust"
)]
struct QueryNameInPascalCase;
```
