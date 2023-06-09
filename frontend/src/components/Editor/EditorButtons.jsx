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
} from "react-bootstrap-icons";
import { BlockPicker } from "./BlockPicker";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';

const EditorButtons = ({
  handleFormating,
  executeIndexerFunction,
  currentUserAccountId,
  getActionButtonText,
  isExecuting,
  stopExecution,
  heights,
  setHeights,
  latestHeight,
  isUserIndexer,
  handleDeleteIndexer,
}) => {
  
  const {
    indexerDetails,
    setIndexerName,
    setShowPublishModal,
    setShowResetCodeModel,
    debugMode,
    accountId,
    isCreateNewIndexer,
    indexerNameField,
    setIndexerNameField,
    contractFilter,
    handleSetContractFilter,
  } = useContext(EditorContext);

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
                <Breadcrumb.Item href="#" active style={{ display: "flex" }}>
                  {isCreateNewIndexer ? (
                    <Form.Control
                      type="text"
                      placeholder="Indexer Name"
                      aria-label="IndexerName"
                      value={indexerNameField}
                      onChange={(e) => setIndexerNameField(e.target.value)}
                    />
                  ) : (
                    indexerNameField
                  )}
                </Breadcrumb.Item>
              </Breadcrumb>
              <InputGroup size="sm" hasValidation={true} style={{ width: "fit-content" }}>
                <InputGroup.Text> Contract Filter</InputGroup.Text>
                <Form.Control
                  value={contractFilter}
                  onChange={handleSetContractFilter}
                  disabled={isCreateNewIndexer}
                  type="text"
                  placeholder="social.near"
                  required={true}
                />
                <Form.Control.Feedback type="invalid">
                  Please provide a valid contract name.
                </Form.Control.Feedback>
              </InputGroup>
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
              style={{ display: "flex", justifyContent: "end", height: "40px" }}
            >
              <ButtonGroup
                className="inline-block"
                aria-label="Action Button Group"
              >
                {isUserIndexer && !isCreateNewIndexer && (
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
                )}

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
                {currentUserAccountId && (
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>{getActionButtonText()}</Tooltip>}
                  >
                    <Button
                      variant="primary"
                      className="px-3"
                      onClick={() => setShowPublishModal(true)}
                    >
                      {getActionButtonText()}
                    </Button>
                  </OverlayTrigger>
                )}
              </ButtonGroup>
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
