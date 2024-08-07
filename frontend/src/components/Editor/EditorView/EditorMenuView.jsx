import React from 'react';
import { Navbar, Container, InputGroup, ButtonGroup, Button } from 'react-bootstrap';
import { Braces, ArrowCounterclockwise, FileText, TrashFill } from 'react-bootstrap-icons';
import CustomTooltip, { TooltipDirection } from '@/components/Common/CustomTooltip';

const EditorMenuView = ({
  // Props
  isUserIndexer,
  handleDeleteIndexer,
  isCreateNewIndexer,
  schemaError,
  // Context
  indexerName,
  accountId,
  indexerDetails,
  setShowPublishModal,
  setShowForkIndexerModal,
  setShowLogsView,
}) => {
  return (
    <Navbar bg="white" variant="light" className="shadow-sm p-3 bg-white rounded">
      <Container fluid className="d-flex flex-wrap justify-content-between align-items-center">
        <div className="d-flex flex-wrap align-items-center">
          {accountId && indexerName && (
            <span className="me-4 font-weight-bold text-secondary text-sm">
              Indexer: {accountId}/{indexerName}
            </span>
          )}

          {!isCreateNewIndexer && (
            <span className="me-4 font-weight-bold text-secondary text-sm">
              Filter: {indexerDetails.rule.affected_account_id}
            </span>
          )}
        </div>
        <ButtonGroup className="mt-3 mt-md-0">
          {isUserIndexer && !isCreateNewIndexer && (
            <CustomTooltip message="Deletes Indexer from QueryAPI" direction={TooltipDirection.Bottom}>
              <Button
                variant="outline-primary"
                size="sm"
                className="d-flex align-items-center"
                onClick={() => handleDeleteIndexer()}
              >
                <TrashFill size={20} />
                Delete
              </Button>
            </CustomTooltip>
          )}
          {isUserIndexer && !isCreateNewIndexer && (
            <Button
              variant="outline-primary"
              size="sm"
              className="d-flex align-items-center"
              onClick={() => setShowForkIndexerModal(true)}
            >
              <Braces className="me-2" size={20} />
              Fork Indexer
            </Button>
          )}

          {!isUserIndexer && !isCreateNewIndexer ? (
            <Button
              variant="outline-primary"
              size="sm"
              className="d-flex align-items-center"
              onClick={() => {
                setShowForkIndexerModal(true);
              }}
            >
              <Braces className="me-2" size={20} />
              Fork Indexer
            </Button>
          ) : (
            <Button
              variant="outline-primary"
              size="sm"
              className="d-flex align-items-center"
              disabled={!!schemaError}
              onClick={() => setShowPublishModal(true)}
            >
              <ArrowCounterclockwise className="me-2" size={20} />
              Publish
            </Button>
          )}
          {!isCreateNewIndexer && (
            <Button
              size="sm"
              variant="outline-primary"
              className="d-flex align-items-center"
              onClick={() => setShowLogsView(true)}
            >
              <FileText className="me-2" size={20} />
              Show Logs
            </Button>
          )}
        </ButtonGroup>
      </Container>
    </Navbar>
  );
};

export default EditorMenuView;
