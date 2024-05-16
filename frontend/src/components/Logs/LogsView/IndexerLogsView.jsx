import { Container, Row, Col } from 'react-bootstrap';
import LogButtons from "../LogButtons";
import Status from "../Status";
import LogFieldCardView from "./LogFieldCardView";
import "gridjs/dist/theme/mermaid.css";

const IndexerLogsView = ({
    severity,
    setSeverity,
    logType,
    setLogType,
    functionName,
    tableName,
    latestHeight,
    currentIndexerDetails,
    currentUserAccountId,
    getIndexerLogsQueryDefinition,
    getIndexerLogsConfig,
    getSearchConfig,
    getPaginationConfig,
    getGridStyle,
    getGridConfig,
    reloadData,
    gridContainerRef
}) => {
    return (
        <>
            <LogButtons
                currentUserAccountId={currentUserAccountId}
                latestHeight={latestHeight}
                reloadData={reloadData}
            />
            <Status
                accountId={currentIndexerDetails.accountId}
                functionName={functionName}
                latestHeight={latestHeight}
            />
            <Container fluid>
                <Row>
                    <Col md={3}>
                        <LogFieldCardView
                            severity={severity}
                            handleSeverityChange={setSeverity}
                            logType={logType}
                            handleLogTypeChange={setLogType}
                        />
                    </Col>
                    <Col md={9}>
                        <div className="w-100 m-0 p-0" ref={gridContainerRef} />
                    </Col>
                </Row>
            </Container>
        </>
    );
};

export default IndexerLogsView;
