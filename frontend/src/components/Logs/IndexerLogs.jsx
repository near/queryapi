import React, { useContext, useState, useEffect, useRef } from "react";
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
  const PAGINATION_LIMIT = 50;

  const functionName = `${indexerDetails.accountId}/${indexerDetails.indexerName}`;
  const hasuraAccountId = indexerDetails.accountId.replace(/\./g, "_");
  const schemaName = `${hasuraAccountId}_${indexerDetails.indexerName}`;
  const tableName = `${schemaName}_sys_logs`;

  const GET_INDEXER_LOGS = gql`
    query GetIndexerLogs($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, order_by: {timestamp: desc}) {
        block_height
        date
        id
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate {
        aggregate {
          count
        }
      }
    }
  `;

  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const [isGridRendered, setIsGridRendered] = useState(false);
  const gridContainerRef = useRef(null);
  const gridRef = useRef(null);

  const { loading, error, data, refetch } = useQuery(GET_INDEXER_LOGS, {
    variables: { limit: PAGINATION_LIMIT, offset: (currentPage - 1) * PAGINATION_LIMIT },
    context: { headers: { "x-hasura-role": hasuraAccountId } },
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (!loading && !error && data && !isGridRendered) {
      setTotalLogsCount(data[`${tableName}_aggregate`]?.aggregate.count || 0);
      renderGrid(data[tableName]);
      setIsGridRendered(true);
    }
  }, [data, error, loading, tableName, isGridRendered]);

  const getGridConfig = (logs) => {
    return {
      columns: [
        "Height",
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
      search: true,
      sort: true,
      resizable: true,
      fixedHeader: true,
      pagination: false,
      resetPageOnUpdate: true,
      style: {
        container: {
          fontFamily: "Roboto Mono, monospace",
        },
        table: {},
        th: {
          width: "auto",
          fontSize: "14px",
          textAlign: "center",
        },
        td: {
          width: "auto",
          fontSize: "12px",
          padding: "5px",
        },
        language: {
          search: {
            placeholder: "🔍 Search by Block Height...",
          },
        },
      },
    };
  };

  const renderGrid = (logs) => {
    const gridConfig = getGridConfig(logs);
    const grid = new Grid(gridConfig);
    grid.render(gridContainerRef.current);
    gridRef.current = grid;
  };

  const handlePagination = (pageNumber) => {
    setCurrentPage(pageNumber);
    refetch();
  };

  const totalPages = Math.ceil(totalLogsCount / PAGINATION_LIMIT);

  useEffect(() => {
    if (gridRef.current && data) {
      renderGrid(data[tableName]);
    }
  }, [data, tableName]);

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
        <p>Error fetching data, {console.log(error)}</p>
      ) : data ? (
        <div style={{}}>
          <div id="grid-logs-container" ref={gridContainerRef}></div>
          {totalLogsCount > PAGINATION_LIMIT && (
            <p style={{ textAlign: "center", fontSize: "14px", margin: "10px 0" }}>
              {`Showing logs ${(currentPage - 1) * PAGINATION_LIMIT + 1} to ${Math.min(
                currentPage * PAGINATION_LIMIT,
                totalLogsCount
              )} of ${totalLogsCount}`}
            </p>
          )}
          <div
            style={{
              maxHeight: "150px",
              overflowY: "auto",
              padding: "10px",
              border: "1px solid #ccc",
            }}
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                style={{
                  backgroundColor: i + 1 === currentPage ? "#007bff" : "transparent",
                  border: "1px solid #ccc",
                  color: i + 1 === currentPage ? "#fff" : "#555",
                  padding: "8px 16px",
                  fontSize: "14px",
                  width: "75px",
                  display: "inline-block",
                  margin: "0 5px 5px 0",
                }}
                key={i}
                onClick={() => handlePagination(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default IndexerLogsComponent;
