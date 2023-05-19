import GraphiQL from "graphiql";
import { sessionStorage } from "near-social-bridge";
import "graphiql/graphiql.min.css";

const HASURA_ENDPOINT =
  process.env.NEXT_PUBLIC_HASURA_ENDPOINT ||
  "https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app/v1/graphql";

const graphQLFetcher = async (graphQLParams, accountId) => {
  console.log(HASURA_ENDPOINT, "Hashura Endpoint");
  const response = await fetch(HASURA_ENDPOINT, {
    method: "post",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      "X-Hasura-Role": accountId.replaceAll(".", "_"),
    },
    body: JSON.stringify(graphQLParams || {}),
  });
  return await response.json();
};

export const GraphqlPlayground = ({ accountId }) => {
  return (
    <div style={{ width: "100%", height: "75vh" }}>
      <GraphiQL
        fetcher={(params) => graphQLFetcher(params, accountId)}
        defaultQuery=""
        storage={sessionStorage}
      />
    </div>
  );
};
