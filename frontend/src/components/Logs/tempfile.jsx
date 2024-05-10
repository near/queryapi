//file for comparison
import React, { useContext, useState, useEffect, useRef } from "react";
import { Grid } from "gridjs";
import "gridjs/dist/theme/mermaid.css";
import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";
import LogButtons from "./LogButtons";
import { useInitialPayload } from "near-social-bridge";
import Status from "./Status";
import { sanitizeString } from "../../utils/helpers";

const IndexerLogsComponent = () => {

  const DEV_ENV = 'https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql'
  const PROD_ENV = '';

  const LOGS_PER_PAGE = 25;

  const { indexerDetails, latestHeight } = useContext(IndexerDetailsContext);
  const { currentUserAccountId } = useInitialPayload();

  const sanitizedAccountId = sanitizeString(indexerDetails.accountId);
  const sanitizedIndexerName = sanitizeString(indexerDetails.indexerName);

  const functionName = `${indexerDetails.accountId}/${indexerDetails.indexerName}`;
  const schemaName = `${sanitizedAccountId}_${sanitizedIndexerName}`;
  const tableName = `${schemaName}_sys_logs`;

  const getIndexerQuery = () => `
    query GetIndexerQuery($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, order_by: {timestamp: desc}) {
        block_height
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
    }`

  const getSearchQuery = (keyword) => `
    query GetSearchQuery($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, where: { message: { _ilike: "%${keyword}%" } }, order_by: { timestamp: desc }) {
        block_height
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate(where: { message: { _ilike: "%${keyword}%" } }) {
        aggregate {
          count
        }
      }
    }  
  `
  const [currentQueryType, setCurrentQueryType] = useState('indexer');
  const [currentQuery, setCurrentQuery] = useState(getIndexerQuery());
  const [keyword, setKeyword] = useState('');

  const gridContainerRef = useRef(null);
  const gridRef = useRef(null);

  const getSearchConfig = () => {
    return {
      server: {
        url: (prev, keyword) => prev,
        body: (prev, keyword) => {
          setKeyword(keyword);
          return JSON.stringify({
            query: getSearchQuery(keyword),
            variables: { limit: LOGS_PER_PAGE, offset: 0 },
          })
        },
        then: ({ data }) => (data[tableName]),
        total: ({ data }) => (data[`${tableName}_aggregate`].aggregate.count),
      },
    }
  }

  const getPaginationConfig = () => {
    return {
      limit: LOGS_PER_PAGE,
      resetPageOnUpdate: true,
      server: {
        url: (prev, page, limit) => prev,
        body: (prev, page, limit) => {
          const offset = page * limit;
          return JSON.stringify({
            query: currentQuery,
            variables: { limit: LOGS_PER_PAGE, offset: offset },
          })
        },
        then: ({ data }) => (data[tableName]),
        total: ({ data }) => (data[`${tableName}_aggregate`].aggregate.count),
      },
    }
  }

  const getIndexerLogsConfig = () => {
    return {
      url: DEV_ENV,
      method: 'POST',
      headers: {
        ['x-hasura-role']: sanitizedAccountId,
        ['Content-Type']: 'application/json',
      },
      body: JSON.stringify({
        query: getIndexerQuery(),
        variables: { limit: LOGS_PER_PAGE, offset: 0 },
      }),
      then: ({ data }) => (data[tableName]),
      total: ({ data }) => (data[`${tableName}_aggregate`].aggregate.count),
    }
  }

  const getGridStyle = () => {
    return {
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
    }
  }
  useEffect(() => {
    if (!keyword) {
      setCurrentQuery(prev => getIndexerQuery());
      setCurrentQueryType(prev => 'indexer');
    } else {
      setCurrentQuery(prev => getSearchQuery(keyword));
      setCurrentQueryType(prev => 'search');
    }
  }, [keyword]);

  useEffect(() => {
    console.log(currentQueryType)
  })
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.updateConfig(getGridConfig()).forceRender();
    }
  }, [currentQueryType]);

  useEffect(() => {
    const gridConfig = getGridConfig();
    const grid = new Grid(gridConfig);
    grid.render(gridContainerRef.current);
    gridRef.current = grid;
  }, []);

  const getGridConfig = () => {
    return {
      columns: ['block_height', 'level', 'message', 'timestamp', 'type'],
      search: getSearchConfig(),
      pagination: getPaginationConfig(),
      server: getIndexerLogsConfig(),
      style: getGridStyle(),
      // sort: true,
    }
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
      {false ? (
        <p>Loading...</p>
      ) : (
        <div>
          <div ref={gridContainerRef}></div>
        </div>
      )}
    </div>
  );
};

export default IndexerLogsComponent;
