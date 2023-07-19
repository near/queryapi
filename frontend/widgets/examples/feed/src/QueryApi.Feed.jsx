const GRAPHQL_ENDPOINT =
  "https://near-queryapi.api.pagoda.co";
const APP_OWNER = "dataplatform.near";

return (
  <Widget
    src={`${APP_OWNER}/widget/QueryApi.Examples.Feed.Posts`}
    props={{
      GRAPHQL_ENDPOINT,
      APP_OWNER,
    }}
  />
);
