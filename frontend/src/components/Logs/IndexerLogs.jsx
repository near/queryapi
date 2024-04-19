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
    query GetIndexerLogs($limit: Int = 0, $offset: Int = 0, $_functionName: String = "") {
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

  const { loading, error, data, refetch } = useQuery(GET_INDEXER_LOGS, {
    variables: { "_functionName": functionName, limit: 50, offset: 0 },
    context: { headers: { "x-hasura-role": indexerDetails.accountId.replace(/\./g, "_") } },
  });

  useEffect(() => {
    if (!loading && !error && data) {
      renderGrid(data[tableName]);
    }
  }, [data, error, loading, tableName]);

  const renderGrid = (logs) => {
    const gridConfig = getGridConfig(logs);
    const grid = new Grid(gridConfig);
    grid.render(document.getElementById("grid-logs-container"));
  };

  const getGridConfig = (logs) => {
    return {
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
          fontFamily: "Roboto Mono, monospace",
        },
        table: {},
        th: {
          textAlign: "center",
          maxWidth: "950px",
          width: "800px",
        },
        td: {
          textAlign: "left",
          fontSize: "11px",
          verticalAlign: "top",
          backgroundColor: "rgb(255, 255, 255)",
          maxHeight: "400px",
          padding: "5px",
        },
      },
      language: {
        search: {
          placeholder: "🔍 Search by Block Height...",
        },
        pagination: {
          results: () => `- Total Logs Count: ${data[`${schemaName}___logs_aggregate`]?.aggregate.count || 0}`,
        },
      },
    };
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
      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p>Error fetching data</p>
      ) : data ? (
        <div id="grid-logs-container"></div>
      ) : null}
    </div>
  );
};

export default IndexerLogsComponent;
