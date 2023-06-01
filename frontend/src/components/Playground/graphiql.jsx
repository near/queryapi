import GraphiQL from "graphiql";
import { sessionStorage } from "near-social-bridge";
import "graphiql/graphiql.min.css";
import { useExplorerPlugin } from '@graphiql/plugin-explorer';
import '@graphiql/plugin-explorer/dist/style.css';
const HASURA_ENDPOINT =
  process.env.NEXT_PUBLIC_HASURA_ENDPOINT ||
  "https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app/v1/graphql";
import { useState } from "react";
const graphQLFetcher = async (graphQLParams, accountId) => {
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
  const [query, setQuery] = useState("");
  const explorerPlugin = useExplorerPlugin({
    query,
    onEdit: setQuery,
  });
  return (
    <div style={{ width: "100%", height: "75vh" }}>
      <GraphiQL
        fetcher={(params) => graphQLFetcher(params, accountId)}
        query={query}
        onEditQuery={setQuery}
        plugins={[explorerPlugin]}
        defaultQuery=""
        storage={sessionStorage}
        theme="dark"
      />
    </div>
  );
};
