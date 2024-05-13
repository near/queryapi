import React, { useContext, useState, useEffect, useRef } from "react";
import { Container, Row, Col } from 'react-bootstrap';
import { Grid } from "gridjs";
import "gridjs/dist/theme/mermaid.css";
import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";
import LogButtons from "./LogButtons";
import { useInitialPayload } from "near-social-bridge";
import Status from "./Status";
import { sanitizeString } from "../../utils/helpers";
import { getIndexerQuery, getPaginationQuery, getBlockHeightAndMessageSearchQuery, getMessageSearchQuery, getIndexerQueryWithSeverity, getMessageSearchQueryWithSeverity, getBlockHeightAndMessageSearchQueryWithSeverity } from './IndexerLogsComponents/Queries';
import SeverityRadioButtonGroup from './IndexerLogsComponents/SeverityRadioButtonGroup';

const IndexerLogsComponent = () => {
  const DEV_ENV = 'https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql';
  const PROD_ENV = 'https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app/v1/graphql';

  const LOGS_PER_PAGE = 50;

  const { indexerDetails, latestHeight } = useContext(IndexerDetailsContext);
  const { currentUserAccountId } = useInitialPayload();

  const sanitizedAccountId = sanitizeString(indexerDetails.accountId);
  const sanitizedIndexerName = sanitizeString(indexerDetails.indexerName);

  const functionName = `${indexerDetails.accountId}/${indexerDetails.indexerName}`;
  const schemaName = `${sanitizedAccountId}_${sanitizedIndexerName}`;
  const tableName = `${schemaName}_sys_logs`;

  const gridContainerRef = useRef(null);
  const gridRef = useRef(null);

  const [severity, setSeverity] = useState('');

  const handleSeverityChange = (selectedSeverity) => {
    setSeverity(selectedSeverity);
  };

  const getSearchConfig = () => {
    return {
      debounceTimeout: 500,
      server: {
        url: (prev, keyword) => prev,
        body: (prev, keyword) => {
          return JSON.stringify({
            query: !severity ? (isNaN(Number(keyword)) ? getMessageSearchQuery(tableName, keyword) : getBlockHeightAndMessageSearchQuery(tableName, keyword)) : (isNaN(Number(keyword)) ? getMessageSearchQueryWithSeverity(tableName, keyword, severity) : getBlockHeightAndMessageSearchQueryWithSeverity(tableName, keyword, severity)),
            variables: { limit: LOGS_PER_PAGE, offset: 0 },
          });
        },
        then: ({ data }) => (data[tableName]),
        total: ({ data }) => (data[`${tableName}_aggregate`].aggregate.count),
      },
    };
  };

  const getPaginationConfig = () => {
    return {
      prevButton: false,
      nextButton: false,
      limit: LOGS_PER_PAGE,
      buttonsCount: 0
    };
  };

  const getIndexerLogsConfig = () => {
    return {
      url: DEV_ENV,
      method: 'POST',
      headers: {
        ['x-hasura-role']: sanitizedAccountId,
        ['Content-Type']: 'application/json',
      },
      body: JSON.stringify({
        query: (severity) ? getIndexerQueryWithSeverity(tableName, severity) : getIndexerQuery(tableName),
        variables: { limit: LOGS_PER_PAGE, offset: 0 },
      }),
      then: ({ data }) => (data[tableName]),
      total: ({ data }) => (data[`${tableName}_aggregate`].aggregate.count),
    };
  };

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
    };
  };

  useEffect(() => {
    renderGrid();
  }, []);

  const renderGrid = () => {
    const gridConfig = getGridConfig();
    const grid = new Grid(gridConfig);
    grid.render(gridContainerRef.current);
    gridRef.current = grid;
  };

  const getGridConfig = () => {
    return {
      columns: ['block_height', 'level', 'message', 'timestamp', 'type'],
      search: getSearchConfig(),
      pagination: getPaginationConfig(),
      server: getIndexerLogsConfig(),
      style: getGridStyle(),
      sort: true,
    };
  };

  const reloadData = () => {
    gridRef.current.destroy();
    renderGrid();
  };

  useEffect(() => {
    reloadData();
  }, [severity]);

  return (
    <>
      <LogButtons
        currentUserAccountId={currentUserAccountId}
        latestHeight={latestHeight}
        reloadData={reloadData}
      />
      <Status
        accountId={indexerDetails.accountId}
        functionName={functionName}
        latestHeight={latestHeight}
      />
      <Container fluid>
        <Row>
          <Col md={2}>
            <div>
              <h6>Selected Severity: {severity}</h6>
              <SeverityRadioButtonGroup
                selectedSeverity={severity}
                onSeverityChange={handleSeverityChange}
              />
            </div>
          </Col>

          <Col md={10}>
            <div
              style={{
                width: "100%",
                margin: "0px",
                padding: "0px",
              }}
              ref={gridContainerRef}
            >
            </div>
          </Col>
        </Row>
      </Container>
    </>

  );
};

export default IndexerLogsComponent;
