import React, { useContext, useEffect } from "react";
import { useQuery, gql } from "@apollo/client";
import { Grid, html } from "gridjs";
import "gridjs/dist/theme/mermaid.css";
import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";
import LogButtons from "./LogButtons";
import { useInitialPayload } from "near-social-bridge";
import Status from "./Status";

const IndexerLogsComponent = () => {
  const { indexerDetails, latestHeight } = useContext(IndexerDetailsContext);
  const { currentUserAccountId } = useInitialPayload();
  const functionName = `${indexerDetails.accountId}/${indexerDetails.indexerName}`;
  const schemaName = `${indexerDetails.accountId.replace(/\./g, "_")}_${indexerDetails.indexerName}`;
  const tableName = `${schemaName}___logs`;

  const GET_INDEXER_LOGS = gql`
    query MyQuery($limit: Int = 0, $offset: Int = 0, $_functionName: String = "") {
      ${schemaName}___logs(limit: $limit, offset: $offset, order_by: {timestamp: desc}) {
        block_height
        date
        id
        level
        message
        timestamp
        type
      }
      ${schemaName}___logs_aggregate {
        aggregate {
          count
        }
      }
    }
  `;

  const { loading, error, data } = useQuery(GET_INDEXER_LOGS, {
    variables: { "_functionName": functionName, limit: 50, offset: 0 },
    context: { headers: { "x-hasura-role": indexerDetails.accountId.replace(/\./g, "_") } },
  });

  useEffect(() => {
    if (!loading && !error && data) {
      renderGrid(data[tableName]);
    }
  }, [data, error, loading, tableName]);

  const renderGrid = (logs) => {
    const grid = new Grid({
      columns: [
        "Block Height",
        "Timestamp",
        "Date",
        "Type",
        "Level",
        {
          name: "Message",
          formatter: (cell) => html(`<div>${cell}</div>`),
          sort: false,
        },
      ],
      data: logs.map((log) => [
        log.block_height,
        log.timestamp,
        log.date,
        log.type,
        log.level,
        log.message,
      ]),
      sort: true,
      search: true,
      resizable: true,
      fixedHeader: true,
      pagination: false, 
      style: {
        container: {
          "font-family": '"Roboto Mono", monospace',
        },
        table: {},
        th: {
          "text-align": "center",
          "max-width": "950px",
          width: "800px",
        },
        td: {
          "text-align": "left",
          "font-size": "11px",
          "vertical-align": "text-top",
          "background-color": "rgb(255, 255, 255)",
          "max-height": "400px",
          padding: "5px",
        },
      },
      language: {
        search: {
          placeholder: "🔍 Search by Block Height...",
        },
        pagination: {
          results: () => `- Total Logs Count: ${data[`${schemaName}___logs_aggregate`].aggregate.count}`,
        },
      },
    });

    grid.render(document.getElementById("grid-logs-container"));
  };

  return (
    <div>
      <LogButtons
        currentUserAccountId={currentUserAccountId}
        latestHeight={latestHeight}
      />
      <Status
        accountId={indexerDetails.accountId}
        functionName={functionName}
        latestHeight={latestHeight}
      />
      <div id="grid-logs-container"></div>
    </div>
  );
};

export default IndexerLogsComponent;
