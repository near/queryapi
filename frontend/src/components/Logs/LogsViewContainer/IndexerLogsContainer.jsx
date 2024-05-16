import React, { useContext, useState, useEffect, useRef } from "react";
import { useInitialPayload } from "near-social-bridge";
import { sanitizeString } from "../../../utils/helpers";
import { IndexerDetailsContext } from "../../../contexts/IndexerDetailsContext";
import IndexerLogsView from "../LogsView/IndexerLogsView";
import { Grid } from "gridjs";
import {
    getIndexerQuery,
    getPaginationQuery,
    getBlockHeightAndMessageSearchQuery,
    getMessageSearchQuery,
    getIndexerQueryWithSeverity,
    getMessageSearchQueryWithSeverity,
    getBlockHeightAndMessageSearchQueryWithSeverity,
    getIndexerQueryWithLogType,
    getIndexerQueryWithSeverityAndLogType,
} from "../GraphQL/Queries";

const DEV_ENV = 'https://queryapi-hasura-graphql-mainnet-vcqilefdcq-ew.a.run.app/v1/graphql';
const PROD_ENV = 'https://queryapi-hasura-graphql-24ktefolwq-ew.a.run.app/v1/graphql';
const LOGS_PER_PAGE = 50;

const IndexerLogsContainer = () => {
    const { indexerDetails, latestHeight } = useContext(IndexerDetailsContext);
    const { currentUserAccountId } = useInitialPayload();

    const sanitizedAccountId = sanitizeString(indexerDetails.accountId);
    const sanitizedIndexerName = sanitizeString(indexerDetails.indexerName);

    const functionName = `${indexerDetails.accountId}/${indexerDetails.indexerName}`;
    const schemaName = `${sanitizedAccountId}_${sanitizedIndexerName}`;
    const tableName = `${schemaName}_sys_logs`;

    const [severity, setSeverity] = useState('');
    const [logType, setLogType] = useState('');

    const handleSeverityChange = (selectedSeverity) => setSeverity(selectedSeverity);
    const handleLogTypeChange = (selectedLogType) => setLogType(selectedLogType);

    const gridContainerRef = useRef(null);
    const gridRef = useRef(null);

    const QueryMapping = {
        default: {
            withSeverity: {
                withLogType: getIndexerQueryWithSeverityAndLogType,
                withoutLogType: getIndexerQueryWithSeverity
            },
            withoutSeverity: {
                withLogType: getIndexerQueryWithLogType,
                withoutLogType: getIndexerQuery
            }
        },
    };

    const getIndexerLogsQueryDefinition = (severity, logType) => {
        const severityKey = severity ? 'withSeverity' : 'withoutSeverity';
        const logTypeKey = logType ? 'withLogType' : 'withoutLogType';
        // console.log(logTypeKey, severityKey, QueryMapping.default[severityKey][logTypeKey](tableName, severity, logType))
        return QueryMapping.default[severityKey][logTypeKey](tableName, severity, logType);
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
                query: getIndexerLogsQueryDefinition(severity, logType),
                variables: { limit: LOGS_PER_PAGE, offset: 0 },
            }),
            then: ({ data }) => (data[tableName]),
            total: ({ data }) => (data[`${tableName}_aggregate`].aggregate.count),
        };
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

    const getGridStyle = () => {
        return {
            container: {
                fontFamily: "Roboto sans-serif",
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
        renderGrid();
    }, []);

    useEffect(() => {
        reloadData();
    }, [severity, logType]);


    return (
        <IndexerLogsView
            severity={severity}
            setSeverity={setSeverity}
            logType={logType}
            setLogType={setLogType}
            functionName={functionName}
            tableName={tableName}
            latestHeight={latestHeight}
            currentIndexerDetails={indexerDetails}
            currentUserAccountId={currentUserAccountId}
            getIndexerLogsQueryDefinition={getIndexerLogsQueryDefinition}
            getIndexerLogsConfig={getIndexerLogsConfig}
            getSearchConfig={getSearchConfig}
            getPaginationConfig={getPaginationConfig}
            getGridStyle={getGridStyle}
            getGridConfig={getGridConfig}
            reloadData={reloadData}
            gridContainerRef={gridContainerRef}
        />
    );
};

export default IndexerLogsContainer;
