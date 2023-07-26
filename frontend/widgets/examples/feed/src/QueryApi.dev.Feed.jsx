const GRAPHQL_ENDPOINT =
  "https://near-queryapi.dev.api.pagoda.co";
const APP_OWNER = "dev-queryapi.dataplatform.near";

let lastPostSocialApi = Social.index("post", "main", {
  limit: 1,
  order: "desc",
});

State.init({
  shouldFallback: props.shouldFallback ?? false,
});

function fetchGraphQL(operationsDoc, operationName, variables) {
  return asyncFetch(`${GRAPHQL_ENDPOINT}/v1/graphql`, {
    method: "POST",
    headers: { "x-hasura-role": "dataplatform_near" },
    body: JSON.stringify({
      query: operationsDoc,
      variables: variables,
      operationName: operationName,
    }),
  });
}

const lastPostQuery = `
query IndexerQuery {
  dataplatform_near_social_feed_posts( limit: 1, order_by: { block_height: desc }) {
      block_height 
  }
}
`;

fetchGraphQL(lastPostQuery, "IndexerQuery", {})
  .then((feedIndexerResponse) => {
    if (feedIndexerResponse && feedIndexerResponse.body.data.dataplatform_near_social_feed_posts.length > 0) {
      const nearSocialBlockHeight = lastPostSocialApi[0].blockHeight;
      const feedIndexerBlockHeight =
        feedIndexerResponse.body.data.dataplatform_near_social_feed_posts[0]
          .block_height;

      const lag = nearSocialBlockHeight - feedIndexerBlockHeight;

      let shouldFallback = lag > 2 || !feedIndexerBlockHeight;

      // console.log(`Social API block height: ${nearSocialBlockHeight}`);
      // console.log(`Feed block height: ${feedIndexerBlockHeight}`);
      // console.log(`Lag: ${lag}`);
      // console.log(`Fallback to old widget? ${shouldFallback}`);

      State.update({ shouldFallback });
    } else {
      console.log("Falling back to old widget.");
      State.update({ shouldFallback: true });
    }
  })
  .catch((error) => {
    console.log("Error while fetching GraphQL(falling back to old widget): ", error);
    State.update({ shouldFallback: true });
  });

return (
  <>
    {state.shouldFallback == true ? (
      <Widget src="near/widget/Posts" />
    ) : (
      <Widget
        src={`${APP_OWNER}/widget/QueryApi.Examples.Feed.Posts`}
        props={{
          GRAPHQL_ENDPOINT,
          APP_OWNER,
        }}
      />
    )}
  </>
);
