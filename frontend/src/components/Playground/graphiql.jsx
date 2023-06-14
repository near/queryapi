import React, { useContext, useState } from "react";
import GraphiQL from "graphiql";
import { sessionStorage } from "near-social-bridge";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { useExporterPlugin } from '@graphiql/plugin-code-exporter';
import { useExplorerPlugin } from '@graphiql/plugin-explorer';
import "graphiql/graphiql.min.css";
import '@graphiql/plugin-code-exporter/dist/style.css';
import '@graphiql/plugin-explorer/dist/style.css';

const HASURA_ENDPOINT =
  process.env.NEXT_PUBLIC_HASURA_ENDPOINT ||
  "https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app/v1/graphql";

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

const extractQueryName = query => {
  const match = query.match(/^[^{(]+\s([^{\s(]+)/);
  return match ? match[1] : null;
};
const extractTableName = query => {
  const match = query.match(/query\s*\w*\s*{\s*([^{\s]+)/);
  return match ? match[1].trim() : null;
};

const bosQuerySnippet = {
  name: `BOS Widget`,
  language: `JavaScript`,
  codeMirrorMode: `jsx`,
  options: [],
  generate: arg => {
    const { operationDataList } = arg;
    const { query } = operationDataList[0];
    const queryName = extractQueryName(query)
    const tableName = extractTableName(query)
    const formattedQuery = query.replace(/\n/g, `\n` + ` `.repeat(2));
    return `
const QUERYAPI_ENDPOINT = \`${HASURA_ENDPOINT}\`;

State.init({
data: []
});

const query = \`${formattedQuery}\`
function fetchGraphQL(operationsDoc, operationName, variables) {
      return asyncFetch(
        QUERYAPI_ENDPOINT,
        {
          method: "POST",
          headers: { "x-hasura-role": "roshaan_near" },
          body: JSON.stringify({
            query: operationsDoc,
            variables: variables,
            operationName: operationName,
          }),
        }
      );
    }

    fetchGraphQL(query, "${queryName}", {}).then((result) => {
      if (result.status === 200) {
        if (result.body.data) {
          const data = result.body.data.${tableName};
          State.update({ data })
          console.log(data);
        }
      }
    });

const renderData = (a) => {
  return (
    <div key={JSON.stringify(a)}>
        {JSON.stringify(a)}
    </div>
  );
};

const renderedData = state.data.map(renderData);
return (
<>
  {renderedData}
</>
)
`;
  },
};

export default () => {
  const { indexerDetails } = useContext(IndexerDetailsContext);
  const snippets = [bosQuerySnippet];
  const [query, setQuery] = useState("");

  const explorerPlugin = useExplorerPlugin({
    query,
    onEdit: setQuery,
  });
  const exporterPlugin = useExporterPlugin({
    query,
    snippets,
    codeMirrorTheme: 'graphiql',
  });

  return (
    <div style={{ width: "100%", height: "75vh" }}>
      <GraphiQL
        query={query}
        onEditQuery={setQuery}
        fetcher={(params) => graphQLFetcher(params, indexerDetails.accountId)}
        query={query}
        onEditQuery={setQuery}
        plugins={[explorerPlugin]}
        defaultQuery=""
        storage={sessionStorage}
        plugins={[explorerPlugin, exporterPlugin]}
      />
    </div>
  );
};
