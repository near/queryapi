import React, { useContext, useRef, useEffect, useState } from "react";
import { Grid, html } from "gridjs";
import "gridjs/dist/theme/mermaid.css";
import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";
import LogButtons from "./LogButtons";
import { useInitialPayload } from "near-social-bridge";
import Status from "./Status";

const LIMIT = 100;

const IndexerLogsComponent = () => {
  const { indexerDetails, debugMode, setLogsView, latestHeight } = useContext(
    IndexerDetailsContext
  );
  const functionName = `${indexerDetails.accountId}/${indexerDetails.indexerName}`;

  const DEBUG_LIST_STORAGE_KEY = `QueryAPI:debugList:${indexerDetails.accountId}#${indexerDetails.indexerName} `;

  const { height, selectedTab, currentUserAccountId } = useInitialPayload();
  const [heights, setHeights] = useState(
    localStorage.getItem(DEBUG_LIST_STORAGE_KEY) || []
  );
  useEffect(() => {
    localStorage.setItem(DEBUG_LIST_STORAGE_KEY, heights);
  }, [heights]);

  const indexerLogsRef = useRef(null);
  const indexerStateRef = useRef(null);

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    const formattedDate = date.toLocaleDateString(undefined, options);

    const now = new Date();
    const diffInSeconds = Math.round((now - date) / 1000);
    let relativeTime = undefined;
    if (diffInSeconds < 60) {
      relativeTime = "(just now)";
    } else if (diffInSeconds < 3600) {
      relativeTime = `(${Math.floor(diffInSeconds / 60)} minutes ago)`;
    } else if (diffInSeconds < 86400) {
      relativeTime = `(${Math.floor(diffInSeconds / 3600)} hours ago)`;
    }

    return `${formattedDate} ${relativeTime ?? ""}`;
  }

  function formatTimestampToReadableLocal(timestamp) {
    const date = new Date(timestamp);

    const options = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    const formattedDate = date.toLocaleString(undefined, options);

    return formattedDate;
  }

  const processLogs = (data) => {
    const logEntries = data.indexer_log_entries.map((row) => ({
      block_height: row.block_height,
      timestamp: row.timestamp,
      message: row.message,
    }));

    const groupedEntries = new Map();

    logEntries.forEach(({ block_height, timestamp, message }) => {
      if (!groupedEntries.has(block_height)) {
        groupedEntries.set(block_height, []);
      }
      groupedEntries.get(block_height).push({ timestamp, message });
    });

    const mergedEntries = Array.from(groupedEntries).map(
      ([block_height, entries]) => {
        const messages = entries
          .map(
            (e) =>
              `<strong>Timestamp: ${e.timestamp
              }(${formatTimestampToReadableLocal(
                e.timestamp
              )}):</strong> \n <p>${e.message}</p>`
          )
          .join("<br>");

        const minTimestamp = entries.reduce(
          (min, e) => (e.timestamp < min ? e.timestamp : min),
          entries[0].timestamp
        );

        const formattedMinTimstamp = formatTimestamp(minTimestamp);
        const humanReadableStamp = formatTimestampToReadableLocal(minTimestamp);

        return {
          block_height,
          timestamp: { humanReadableStamp, formattedMinTimstamp },
          messages,
        };
      }
    );

    return mergedEntries;
  };

  const initializeTable = () => {
    const grid = new Grid({
      columns: [
        {
          name: "Block Height",
          formatter: (cell) =>
            html(
              `<div style="text-align: center;"><a target='_blank' href='https://legacy.explorer.near.org/?query=${cell}'>${cell}</a></div>`
            ),
        },
        "Timestamp",
        {
          name: "Message",
          formatter: (cell) => html(`<div>${cell}</div>`),
          sort: false,
        },
      ],
      search: {
        server: {
          url: (prev, keyword) =>
            `${process.env.NEXT_PUBLIC_HASURA_ENDPOINT}/api/rest/queryapi/logsByBlock/?_functionName=${functionName}&_blockHeight=${keyword}`,
          then: (data) => {
            const logs = processLogs(data).map((log) => [
              log.block_height,
              log.timestamp.formattedMinTimstamp,
              log.messages,
            ]);
            return logs;
          },
          debounceTimeout: 2000,
        },
      },
      sort: true,
      resizable: true,
      fixedHeader: true,
      pagination: {
        limit: 30,
        server: {
          url: (prev, page, limit) => {
            return prev + "&limit=" + limit + "&offset=" + page * limit;
          },
        },
      },
      server: {
        url: `${process.env.NEXT_PUBLIC_HASURA_ENDPOINT}/api/rest/queryapi/logs/?_functionName=${functionName}`,
        headers: {
          "x-hasura-role": "append",
        },
        then: (data) => {
          const logs = processLogs(data).map((log) => [
            log.block_height,
            log.timestamp.formattedMinTimstamp,
            log.messages,
          ]);
          return logs;
        },
        total: (data) => data.indexer_log_entries_aggregate.aggregate.count,
      },
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
          results: () => "Indexer Logs",
        },
      },
    });

    grid.render(indexerLogsRef.current);
  };

  useEffect(() => {
    initializeTable();
  }, []);

  const reloadData = () => {
    indexerLogsRef.current.innerHTML = "";
    setTimeout(() => {
      initializeTable();
    }, 500);
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%"
        }}
      >
        <LogButtons
          currentUserAccountId={currentUserAccountId}
          heights={heights}
          setHeights={setHeights}
          latestHeight={height}
          isUserIndexer={indexerDetails.accountId === currentUserAccountId}
          reloadData={reloadData}
        />
        <Status
          functionName={functionName}
          latestHeight={latestHeight}
        />
        <div ref={indexerLogsRef} />
      </div>
    </>
  );
};

export default IndexerLogsComponent;
