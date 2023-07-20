const GRAPHQL_ENDPOINT =
  "https://near-queryapi.dev.api.pagoda.co";
const APP_OWNER = "dev-queryapi.dataplatform.near";

let accountsFollowing = undefined;

if (context.accountId) {
  const graph = Social.keys(`${context.accountId}/graph/follow/*`, "final");
  if (graph !== null) {
    accountsFollowing = Object.keys(graph[context.accountId].graph.follow || {});
    accountsFollowing.push(context.accountId);
  }
}

return (
  <Widget
    src={`${APP_OWNER}/widget/QueryApi.Examples.Feed.Posts`}
    props={{
      GRAPHQL_ENDPOINT,
      APP_OWNER,
      accountsFollowing
    }}
  />
);
