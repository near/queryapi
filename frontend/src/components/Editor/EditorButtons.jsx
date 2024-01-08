import React, { useContext } from "react";
import {
  Breadcrumb,
  Button,
  Form,
  InputGroup,
  Navbar,
  Container,
  Col,
  Row,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
  Badge,
} from "react-bootstrap";
import {
  ArrowCounterclockwise,
  Justify,
  TrashFill,
  XCircle,
  NodePlus,
  Code,
  FileText,
} from "react-bootstrap-icons";
import { BlockPicker } from "./BlockPicker";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { TYPE_GENERATION_ERROR_TYPE } from "@/constants/Strings";

const EditorButtons = ({
  handleFormating,
  handleCodeGen,
  executeIndexerFunction,
  isExecuting,
  stopExecution,
  heights,
  setHeights,
  latestHeight,
  isUserIndexer,
  handleDeleteIndexer,
  error
}) => {

  const {
    indexerName,
    accountId,
    indexerDetails,
    setShowPublishModal,
    setShowResetCodeModel,
    setShowForkIndexerModal,
    debugMode,
    isCreateNewIndexer,
    setShowLogsView,
  } = useContext(IndexerDetailsContext);

  const removeHeight = (index) => {
    setHeights(heights.filter((_, i) => i !== index));
  };

  return (
    <>
      <Navbar bg="light" variant="light">
        <Container
          style={{
            display: "flex",
            flexDirection: "column",
            margin: "0px",
            maxWidth: "100%",
          }}
        >
          <Row className="w-100">
            <Col style={{ display: "flex", justifyContent: "start", flexDirection: "column" }}>
              <Breadcrumb className="flex">
                <Breadcrumb.Item className="flex align-center " href="#">
                  {accountId}
                </Breadcrumb.Item>
                {indexerName && (
                  <Breadcrumb.Item href="#" active style={{ display: "flex" }}>
                    {indexerName}
                  </Breadcrumb.Item>
                )}
              </Breadcrumb>
              {!isCreateNewIndexer && <InputGroup size="sm" hasValidation={true} style={{ width: "fit-content" }}>
                <InputGroup.Text> Contract Filter</InputGroup.Text>
                <Form.Control
                  disabled={!isCreateNewIndexer}
                  value={indexerDetails.config.filter}
                  type="text"
                  placeholder="social.near"
                  required={true}
                />
                <Form.Control.Feedback type="invalid">
                  Please provide a valid contract name.
                </Form.Control.Feedback>
              </InputGroup>}
            </Col>
            <Col style={{ display: "flex", justifyContent: "center" }}>
              {debugMode && (
                <BlockPicker
                  heights={heights}
                  setHeights={setHeights}
                  executeIndexerFunction={executeIndexerFunction}
                  latestHeight={latestHeight}
                  isExecuting={isExecuting}
                  stopExecution={stopExecution}
                />
              )}
            </Col>
            <Col
              style={{ display: "flex", justifyContent: "end", flexDirection: "column", alignItems: "flex-end" }}
            >
              <ButtonGroup
                className="inline-block"
                aria-label="Action Button Group"
              >
                {isUserIndexer && !isCreateNewIndexer && (
                  <>
                    <OverlayTrigger
                      placement="bottom"
                      overlay={<Tooltip>Delete Indexer</Tooltip>}
                    >
                      <Button
                        size="sm"
                        className="flex align-center"
                        variant="danger"
                        onClick={() => handleDeleteIndexer()}
                      >
                        <TrashFill size={22} />
                      </Button>
                    </OverlayTrigger>
                    <OverlayTrigger
                      placement="bottom"
                      overlay={<Tooltip>Fork this Indexer</Tooltip>}
                    >
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex align-center"
                        onClick={() => setShowForkIndexerModal(true)}
                      >
                        <NodePlus style={{ paddingRight: "2px" }} size={24} />
                      </Button>
                    </OverlayTrigger>
                  </>
                )}

                {!isCreateNewIndexer && (
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Open Logs</Tooltip>}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex align-center"
                      onClick={() => setShowLogsView(true)}
                    >
                      <FileText style={{ paddingRight: "2px" }} size={24} />
                      Show Logs
                    </Button>
                  </OverlayTrigger>
                )}
                {(!isUserIndexer && !isCreateNewIndexer) ? (
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Fork Indexer</Tooltip>}
                  >
                    <Button
                      variant="primary"
                      className="px-3"
                      onClick={() => setShowForkIndexerModal(true)}
                    >
                      Fork Indexer
                    </Button>
                  </OverlayTrigger>
                ) : (
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Publish</Tooltip>}
                  >
                    <Button
                      variant="primary"
                      className="px-3"
                      disabled={!!error && error.type !== TYPE_GENERATION_ERROR_TYPE}
                      onClick={() => setShowPublishModal(true)}
                    >
                      Publish
                    </Button>
                  </OverlayTrigger>
                )}
              </ButtonGroup>
              <Row
                style={{ display: "flex", justifyContent: "center", width: "60%", padding: "5px" }}
              >
                <ButtonGroup>
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Reset Changes To Code</Tooltip>}
                  >
                    <Button
                      size="sm"
                      className="flex align-center"
                      variant="secondary"
                      onClick={() => setShowResetCodeModel(true)}
                    >
                      <ArrowCounterclockwise size={22} />
                    </Button>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Format Code</Tooltip>}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex align-center"
                      onClick={() => handleFormating()}
                    >
                      <Justify style={{ paddingRight: "2px" }} size={24} />
                    </Button>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Generate Types</Tooltip>}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex align-center"
                      onClick={() => handleCodeGen()}
                    >
                      <Code style={{ paddingRight: "2px" }} size={24} />
                    </Button>
                  </OverlayTrigger>
                </ButtonGroup>
              </Row>
            </Col>
          </Row>
          {debugMode && heights.length > 0 && (
            <Row className="w-100 pt-2">
              <div>
                {heights.map((height, index) => (
                  <Badge pill bg="secondary" className="mx-1 mr-2" key={index}>
                    {height}
                    <XCircle
                      size={18}
                      style={{ paddingLeft: "4px", cursor: "pointer" }}
                      onClick={() => removeHeight(index)}
                    />
                  </Badge>
                ))}
              </div>
            </Row>
          )}
        </Container>
      </Navbar>
    </>
  );
};

export default EditorButtons;
