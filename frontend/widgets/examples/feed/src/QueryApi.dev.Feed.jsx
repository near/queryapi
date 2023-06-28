const GRAPHQL_ENDPOINT =
  "https://near-queryapi.dev.api.pagoda.co";
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
