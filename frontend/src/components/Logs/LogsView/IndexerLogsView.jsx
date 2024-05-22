import { Container, Row, Col } from 'react-bootstrap';
import LogsMenu from '../LogsMenu';
import LogFieldCardView from "./LogFieldCardView";
import "gridjs/dist/theme/mermaid.css";
import styled from "styled-components";

const CustomGridContainer = styled.div`
 .gridjs-wrapper{
    border-radius: 0 !important;
    box-shadow: none !important;
    border: 1px solid #d2d2d2 !important;
    border-collapse: collapse !important;
  }
 .gridjs-container{
    padding: 0 2px !important;
  }
 .gridjs-table {
    border-collapse: collapse;
  }
 .gridjs-td {
    border: none;
  }
 .gridjs-search {
    width: 100% !important;
  }
 .gridjs-search-input{
    width: 100% !important;
    padding: 18px !important;
    border-radius: 4px 4px 0px 0 !important;
    border: 1px solid #d2d2d2 !important;
  }
 .gridjs-head{
    padding:0 !important;
    margin:0 !important;
  }
`;


const IndexerLogsView = ({
    severity,
    setSeverity,
    logType,
    setLogType,
    startTime,
    setStartTime,
    functionName,
    tableName,
    latestHeight,
    currentIndexerDetails,
    currentUserAccountId,
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
            <LogsMenu
                currentUserAccountId={currentUserAccountId}
                latestHeight={latestHeight}
                reloadData={reloadData}
                accountId={currentIndexerDetails.accountId}
                functionName={functionName}
            />
       
            <Container fluid
                className='w-100 h-screen'
            >
                <Row className="transform scale-[0.7] origin-top-left w-[142.86%] h-[142.86%]">
                    <Col md={2}>
                        <LogFieldCardView
                            severity={severity}
                            handleSeverityChange={setSeverity}
                            logType={logType}
                            handleLogTypeChange={setLogType}
                            dateFilter={startTime}
                            handleDateFilter={setStartTime}
                        />
                    </Col>
                    <Col md={10}>
                        <CustomGridContainer className="w-100 m-0 p-0" ref={gridContainerRef} />
                    </Col>
                </Row>
            </Container >
        </>
    );
};

export default IndexerLogsView;
