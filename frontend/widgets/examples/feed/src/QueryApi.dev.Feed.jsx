const GRAPHQL_ENDPOINT =
  "https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app";
const APP_OWNER = "dev-queryapi.dataplatform.near";


return (
  <Widget
    src={`${APP_OWNER}/widget/QueryApi.Examples.Feed`}
    props={{
      GRAPHQL_ENDPOINT,
      APP_OWNER,
    }}
  />
);
