import React, { useContext, useState, useMemo } from "react";
import GraphiQL from "graphiql";
import { sessionStorage } from "near-social-bridge";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { codeExporterPlugin } from '@graphiql/plugin-code-exporter';
import { explorerPlugin } from '@graphiql/plugin-explorer';
import "graphiql/graphiql.min.css";
import '@graphiql/plugin-code-exporter/dist/style.css';
import '@graphiql/plugin-explorer/dist/style.css';

const HASURA_ENDPOINT =
  process.env.NEXT_PUBLIC_HASURA_ENDPOINT ||
  "https://near-queryapi.dev.api.pagoda.co/v1/graphql";

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
  const match = query.match(/query\s*\w*\s*{\s*([^({\s]+)/);
  return match ? match[1].trim() : null;
};

const bosQuerySnippet = (accountId) => {
  return {
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
          headers: { "x-hasura-role": \`${accountId?.replaceAll(".", "_")}\` },
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
);`;
    }
  }
};


const explorer = explorerPlugin();

export const GraphqlPlayground = () => {
  const { indexerDetails } = useContext(IndexerDetailsContext);
  const snippets = useMemo(()=>[bosQuerySnippet(indexerDetails.accountId)], [indexerDetails.accountId]);
  const exporter = useMemo(()=> codeExporterPlugin({snippets}), [snippets])

  return (
    <div style={{ width: "100%", height: "75vh" }}>
      <GraphiQL
        fetcher={(params) => graphQLFetcher(params, indexerDetails.accountId)}
        storage={sessionStorage}
        plugins={[exporter, explorer]}
      />
    </div>
  );
};
